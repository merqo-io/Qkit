"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MenuItemCard } from "@/components/order/menu-item-card";
import { ItemCustomizer } from "@/components/order/item-customizer";
import { Ticket } from "@/components/widgets/ticket";
import { Button } from "@merqo/ui/primitives";

import { placeOrderSchema } from "@/lib/schemas";
import { count, formatPrice, orderHasPricing } from "@/lib/utils";
import { cartKey, cartTotal } from "@/lib/cart";
import { useCart } from "@/hooks/use-cart";
import { loadCart, saveCart, clearCart } from "@/lib/cart-storage";
import { reconcileReorder } from "@/lib/reorder";
import { takeReorder } from "@/lib/reorder-handoff";
import { remainingFor, type Remaining } from "@/lib/stock";
import {
  addBlock,
  addBlockMessage,
  boothLimitExcludedIds,
  fitCart,
  type Availability,
} from "@/lib/availability";
import { useCartAvailability } from "./use-cart-availability";
import { BasketLimits } from "./basket-limits";
import { CartSummary } from "./cart-summary";
import { CheckoutSheet } from "./checkout-sheet";
import { OrderMenu } from "./order-menu";
import { useOrderSubmission } from "./use-order-submission";
import { logEvent } from "@/app/actions/events";
import { groupByCategory } from "@/lib/menu-sections";
import type { MenuItem, MenuCategory, SelectedOption } from "@/lib/types";

interface Props {
  code: string;
  boothId: string;
  menuItems: MenuItem[];
  menuCategories?: MenuCategory[];
  closed?: boolean;
  // Live remaining per capped item (id → count). Absent id = unlimited.
  remaining?: Remaining;
  // Items left in the booth's daily total; null = the booth has none.
  left?: number | null;
  // Most items one order may carry; null = the booth sets no limit.
  maxPerOrder?: number | null;
  // The booth takes no payment through qkit, so a priced basket is paid in
  // person and the sheet says so.
  paysInPerson?: boolean;
}

export function OrderForm({
  code,
  boothId,
  menuItems,
  menuCategories = [],
  closed = false,
  remaining = {},
  left = null,
  maxPerOrder = null,
  paysInPerson = false,
}: Props) {
  const {
    cart,
    setCart,
    entries: cartEntries,
    items: cartItems,
    add: addLine,
    increment: incrementLine,
    decrement,
  } = useCart();
  // What the server rendered, before anyone's basket hold is counted.
  const [initialAvailability] = useState<Availability>(() => ({
    remaining,
    held: {},
    left,
    leftHeld: 0,
    maxPerOrder,
  }));
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const hydrated = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<{ customerName: string; customerPhone?: string }>({
    resolver: zodResolver(
      placeOrderSchema.pick({ customerName: true, customerPhone: true }),
    ),
  });

  // Funnel: a QR landing (this form mounted). Fire-and-forget; paired with the
  // order_placed event to measure scan→order. Coarse — a refresh or back-nav
  // re-counts a view — which is fine for the pilot conversion signal.
  useEffect(() => {
    void logEvent("booth_view", { boothId });
  }, [boothId]);

  // Seed the cart on mount. A "reorder" handoff (explicit intent from the status
  // / recent-orders pages, read-once) wins; otherwise restore an in-progress
  // cart persisted from a prior visit (survives a refresh or mobile tab-eviction
  // — see cart-storage). Either source is reconciled against the LIVE menu +
  // stock here, so prices/availability are always current, never a stale snapshot.
  useEffect(() => {
    const seed = takeReorder(boothId);
    const lines = seed ? seed.lines : loadCart(boothId);
    if (lines.length === 0) return;
    const { items, unavailable } = reconcileReorder(
      lines,
      menuItems,
      remaining,
    );
    if (items.length === 0) {
      // A reorder that can't be fulfilled tells the customer; a persisted cart
      // whose items are all gone is dropped silently (they didn't ask for it).
      if (seed) {
        toast.error("Those items aren't available anymore. Start a new order.");
      } else {
        clearCart(boothId);
      }
      return;
    }
    setCart(
      new Map(items.map((it) => [cartKey(it.menuItemId, it.options), it])),
    );
    if (seed) {
      if (seed.customerName) setValue("customerName", seed.customerName);
      toast.success(
        unavailable > 0
          ? `Added ${count(items.length, "item")} · ${unavailable} no longer available`
          : `Added ${count(items.length, "item")} to your order`,
      );
    } else if (unavailable > 0) {
      // Restored, but some saved items sold out while the customer was away.
      toast.error(
        `${count(unavailable, "item")} sold out and ${
          unavailable > 1 ? "were" : "was"
        } removed`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only boothId should re-run this one-shot read
  }, [boothId]);

  // Persist the cart on every change so a refresh / tab-eviction restores it
  // (the seed effect above reads it back). Skip the first invocation (mount) so
  // an initial empty render can't clobber a saved cart before the restore lands.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveCart(
      boothId,
      Array.from(cart.values(), (it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        options: it.options,
      })),
    );
  }, [cart, boothId]);

  const { availability: heldAvailability, holdSession } = useCartAvailability(
    boothId,
    initialAvailability,
    cartItems.map((it) => ({
      menuItemId: it.menuItemId,
      quantity: it.quantity,
    })),
    !closed,
  );

  const boothLimitExcluded = useMemo(
    () => boothLimitExcludedIds(menuItems),
    [menuItems],
  );

  // Anonymous holds cannot deny purchases; only sold stock and order limits can.
  const availability = useMemo<Availability>(
    () => ({
      ...heldAvailability,
      remaining: Object.fromEntries(
        Object.entries(heldAvailability.remaining).map(([id, left]) => [
          id,
          left + (heldAvailability.held[id] ?? 0),
        ]),
      ),
      left:
        heldAvailability.left === null
          ? null
          : heldAvailability.left + heldAvailability.leftHeld,
    }),
    [heldAvailability],
  );

  // Remove items only when actual stock or a vendor's order limit has changed.
  useEffect(() => {
    const fitted = fitCart(
      Array.from(cart.values()),
      availability,
      boothLimitExcluded,
    );
    if (fitted.trimmed === 0) return;
    setCart(
      new Map(
        fitted.items.map((it) => [cartKey(it.menuItemId, it.options), it]),
      ),
    );
    toast.error(
      `${count(fitted.trimmed, "item")} no longer available, removed from your order`,
    );
  }, [availability, boothLimitExcluded, cart, setCart]);

  /** Block (and explain) when one more would exceed stock or a booth limit. */
  function blockedByStock(menuItemId: string): boolean {
    const block = addBlock(
      cartItems,
      menuItemId,
      availability,
      boothLimitExcluded,
    );
    if (!block) return false;
    toast.error(addBlockMessage(block));
    return true;
  }

  function addConfigured(item: MenuItem, options: SelectedOption[]) {
    if (blockedByStock(item.id)) return;
    addLine(item, options);
  }

  function increment(key: string) {
    const entry = cart.get(key);
    if (entry && blockedByStock(entry.menuItemId)) return;
    incrementLine(key);
  }

  function onAddClick(item: MenuItem) {
    if (item.option_groups && item.option_groups.length > 0) {
      setCustomizing(item);
    } else {
      addConfigured(item, []);
    }
  }

  const total = cartTotal(cartItems);
  const itemCount = cartItems.reduce((n, it) => n + it.quantity, 0);

  const { submitting, submitError, onSubmit } = useOrderSubmission({
    code,
    boothId,
    closed,
    cartItems,
    holdSession,
  });

  const hasItems = cartItems.length > 0;
  const cartPriced = orderHasPricing(cartItems);
  const sections = groupByCategory(menuItems, menuCategories);
  function renderItemCard(item: MenuItem) {
    const hasOptions = !!item.option_groups && item.option_groups.length > 0;
    // Configured items use the sheet and cart-summary controls.
    const plainKey = cartKey(item.id);
    const plainInCart = hasOptions ? undefined : cart.get(plainKey);
    // An item with options can sit in the basket as several lines; its card
    // still has to say it is in there.
    const configuredInCart = hasOptions
      ? cartItems
          .filter((line) => line.menuItemId === item.id)
          .reduce((sum, line) => sum + line.quantity, 0)
      : 0;
    return (
      <MenuItemCard
        key={item.id}
        item={item}
        plainQuantity={plainInCart?.quantity}
        configuredInCart={configuredInCart}
        left={remainingFor(availability.remaining, item.id)}
        held={(availability.held[item.id] ?? 0) > 0}
        closed={closed}
        onAdd={() => onAddClick(item)}
        onIncrement={() => increment(plainKey)}
        onDecrement={() => decrement(plainKey)}
      />
    );
  }

  // The trigger just opens the sheet, so it reads as a step, not the final action.
  let triggerLabel: string;
  if (closed) triggerLabel = "Booth closed";
  else if (!hasItems) triggerLabel = "Add items to order";
  else if (cartPriced)
    triggerLabel = `Continue · ${count(itemCount, "item")} · ${formatPrice(total)}`;
  else triggerLabel = `Continue · ${count(itemCount, "item")}`;

  // Payment-agnostic: whether this booth requires payment isn't known here (decided
  // server-side in place_order), so the label can't promise a number.
  const confirmLabel = submitting ? "Placing order…" : "Place order";

  // A booth with no menu yet: show a friendly placeholder instead of an empty
  // list under a bare "Menu" heading with a dead "Add items" bar (reads broken).
  if (menuItems.length === 0) {
    return (
      <Ticket shadow="none" radius="xl" className="px-6 py-12 text-center">
        <p className="font-display text-lg font-semibold">Menu coming soon</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This booth hasn&apos;t added its menu yet. Check back soon.
        </p>
      </Ticket>
    );
  }
  return (
    <div className="space-y-8">
      {!closed && <BasketLimits availability={availability} />}
      <OrderMenu
        sections={sections}
        menuItems={menuItems}
        renderItemCard={renderItemCard}
      />

      {/* Collapsed by default so a long menu doesn't push the summary between
          the customer and the rest of the items. */}
      {hasItems && (
        <CartSummary
          entries={cartEntries}
          itemCount={itemCount}
          total={total}
          priced={cartPriced}
          expanded={cartExpanded}
          onToggle={() => setCartExpanded((v) => !v)}
          onDecrement={decrement}
          onIncrement={increment}
        />
      )}

      {/* Sticky checkout trigger */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          <Button
            type="button"
            size="lg"
            className="h-14 w-full rounded-xl text-base font-semibold"
            onClick={() => setCheckoutOpen(true)}
            disabled={!hasItems || closed}
          >
            {triggerLabel}
          </Button>
        </div>
      </div>

      <CheckoutSheet
        open={checkoutOpen}
        onOpenChange={(open) => {
          if (!submitting) setCheckoutOpen(open);
        }}
        entries={cartEntries}
        hasItems={hasItems}
        priced={cartPriced}
        total={total}
        paysInPerson={paysInPerson}
        closed={closed}
        submitting={submitting}
        submitError={submitError}
        confirmLabel={confirmLabel}
        onSubmit={handleSubmit(onSubmit)}
        register={register}
        errors={errors}
      />

      <ItemCustomizer
        item={customizing}
        onClose={() => setCustomizing(null)}
        onAdd={addConfigured}
      />
    </div>
  );
}
