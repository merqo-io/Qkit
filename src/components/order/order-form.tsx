"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { DataCollectionNotice } from "@merqo/ui";
import { ChevronDown, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MediaImage } from "@/components/widgets/media-image";
import { ItemCustomizer } from "@/components/order/item-customizer";
import { MenuItemCard } from "@/components/order/menu-item-card";
import { Ticket } from "@/components/widgets/ticket";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import {
  cn,
  count,
  formatOptions,
  formatPrice,
  orderHasPricing,
} from "@/lib/utils";
import { cartKey, cartTotal } from "@/lib/cart";
import { useCart } from "@/hooks/use-cart";
import { loadCart, saveCart, clearCart } from "@/lib/cart-storage";
import {
  loadPendingOrder,
  savePendingOrder,
  clearPendingOrder,
  orderFingerprint,
  type PendingOrder,
  RecoveryStorageError,
} from "@/lib/pending-order";
import { addRecentOrder } from "@/lib/recent-orders";
import { reconcileReorder } from "@/lib/reorder";
import { takeReorder } from "@/lib/reorder-handoff";
import { remainingFor, type Remaining } from "@/lib/stock";
import {
  addBlock,
  addBlockMessage,
  fitCart,
  type Availability,
} from "@/lib/availability";
import { useCartAvailability } from "./use-cart-availability";
import { placeOrder } from "@/app/o/[code]/actions";
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
}

// Below this many items left, the menu says how many. Above it the number is
// noise: nobody queues differently at 40 remaining.
const LOW_STOCK_ITEMS = 10;

// Low-stock counts include unsold items in other baskets; holds are advisory.
function StockNotice({
  left,
  leftHeld,
}: {
  left: number | null;
  leftHeld: number;
}) {
  if (left === null || left > LOW_STOCK_ITEMS) return null;
  if (left > 0)
    return (
      <div className="rounded-xl border border-status-aging/40 bg-status-aging/10 px-4 py-3 text-center">
        <p className="text-sm font-semibold">
          Only {count(left, "item")} left today
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {leftHeld > 0
            ? "Other baskets also contain these items. Stock is checked when you order."
            : "Once they are gone this stall stops taking orders until tomorrow."}
        </p>
      </div>
    );
  return null;
}

// Limits that apply to the whole basket, said once above the menu so nobody
// finds them out from a refused tap.
function BasketLimits({ availability }: { availability: Availability }) {
  const { left, leftHeld, maxPerOrder } = availability;
  const stock =
    left !== null && left <= LOW_STOCK_ITEMS && (left > 0 || leftHeld > 0);
  if (!stock && maxPerOrder === null) return null;
  return (
    <div className="mx-auto max-w-lg space-y-2">
      <StockNotice left={left} leftHeld={leftHeld} />
      {maxPerOrder !== null && (
        <p className="text-center text-sm text-muted-foreground">
          Up to {count(maxPerOrder, "item")} per order at this stall.
        </p>
      )}
    </div>
  );
}

/**
 * Where focus lands when the checkout sheet opens. With a mouse or keyboard
 * it goes to the name field, the one thing the sheet asks for. On a touch
 * screen that would raise the keyboard over the order and the button before
 * the customer has read either, so focus goes to the sheet itself and the
 * keyboard waits for a tap.
 */
function focusCheckoutSheet(event: Event) {
  event.preventDefault();
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const target = touch
    ? event.currentTarget
    : document.getElementById("customerName");
  if (target instanceof HTMLElement) target.focus();
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
}: Props) {
  const router = useRouter();
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
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Why the last attempt to place the order failed. Shown in the checkout
  // sheet beside the button, so it stays put until the customer acts on it.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cartExpanded, setCartExpanded] = useState(false);
  const hydrated = useRef(false);
  const [unresolvedSubmit, setUnresolvedSubmit] = useState<PendingOrder | null>(
    null,
  );

  useEffect(() => {
    try {
      if (loadPendingOrder(boothId))
        toast.error(
          "A previous order is awaiting confirmation. Re-enter the same details to recover it.",
        );
    } catch (error) {
      if (error instanceof RecoveryStorageError) {
        toast.error(
          "Order recovery storage is unavailable. Stay on this page if you place an order.",
        );
        return;
      }
      toast.error(
        "Could not restore the previous order attempt. Check with the vendor before ordering again.",
      );
    }
  }, [boothId]);

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
    // boothId is the only real input; menuItems/remaining are stable props and
    // both reads are one-shot, so re-runs are harmless no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const fitted = fitCart(Array.from(cart.values()), availability);
    if (fitted.trimmed === 0) return;
    setCart(
      new Map(
        fitted.items.map((it) => [cartKey(it.menuItemId, it.options), it]),
      ),
    );
    toast.error(
      `${count(fitted.trimmed, "item")} no longer available, removed from your order`,
    );
  }, [availability, cart, setCart]);

  /** Block (and explain) when one more would exceed stock or a booth limit. */
  function blockedByStock(menuItemId: string): boolean {
    const block = addBlock(cartItems, menuItemId, availability);
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

  async function prepareOrderAttempt(
    input: PlaceOrderInput,
  ): Promise<string | null> {
    try {
      const fingerprint = await orderFingerprint(input);
      let pending = unresolvedSubmit;
      let canPersist = true;
      try {
        pending ??= loadPendingOrder(boothId);
      } catch (error) {
        if (!(error instanceof RecoveryStorageError)) throw error;
        canPersist = false;
      }
      if (pending && pending.fingerprint !== fingerprint) {
        toast.error("Retry your previous order before changing its details.");
        return null;
      }
      const attempt = pending ?? { key: crypto.randomUUID(), fingerprint };
      setUnresolvedSubmit(attempt);
      try {
        savePendingOrder(boothId, attempt);
      } catch (error) {
        if (!(error instanceof RecoveryStorageError)) throw error;
        canPersist = false;
      }
      if (!canPersist)
        toast.error(
          "This order can only be recovered on this page. Keep it open until confirmation.",
        );
      return attempt.key;
    } catch {
      toast.error(
        "Could not safely restore this order. Check with the vendor before ordering again.",
      );
      return null;
    }
  }

  async function onSubmit(formData: {
    customerName: string;
    customerPhone?: string;
  }) {
    if (closed) {
      toast.error("This booth is closed right now");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Add at least one item to your order");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const input: PlaceOrderInput = {
      customerName: formData.customerName,
      customerPhone: formData.customerPhone,
      items: cartItems,
    };
    const idem = await prepareOrderAttempt(input);
    if (idem === null) {
      setSubmitting(false);
      return;
    }
    // One retry on a transient network failure (patchy event-site signal) so a
    // dropped request doesn't lose the order. The DB order number is atomic, so
    // a retried submit can't duplicate.
    // The basket's hold, when the booth has stock to hold, goes with the
    // order so placing it lets the hold go.
    const session = holdSession();
    const submit = () =>
      session
        ? placeOrder(code, input, idem, session)
        : placeOrder(code, input, idem);
    let result: Awaited<ReturnType<typeof placeOrder>>;
    try {
      result = await submit();
    } catch {
      try {
        result = await submit();
      } catch {
        setSubmitError(
          "We couldn't reach the stall. Your order has not gone through. It is safe to try again: it can't be placed twice.",
        );
        setSubmitting(false);
        return;
      }
    }

    try {
      clearPendingOrder(boothId);
      setUnresolvedSubmit(null);
    } catch {
      toast.error(
        "Could not clear the saved order attempt. Check this order before ordering again.",
      );
    }

    if (!result.success) {
      setSubmitError(
        result.error ?? "The order did not go through. Try again.",
      );
      setSubmitting(false);
      return;
    }

    // Order placed — the persisted cart has served its purpose; drop it so
    // returning to this booth starts fresh rather than restoring a placed cart.
    clearCart(boothId);

    // Remember on-device so the customer can find this order again after
    // closing the tab (no server-side customer identity exists). The compact
    // items snapshot powers one-tap reorder from the list. A payment-required
    // order has no number yet; the list reaches it through its token's pay
    // step until the status page fills the number in.
    addRecentOrder({
      boothId,
      ...(result.orderNumber ? { orderNumber: result.orderNumber } : {}),
      customerName: formData.customerName,
      // The per-order token gates the status page + its polling reads; store it
      // so a "track your recent order" link can reopen the page later.
      token: result.accessToken,
      items: cartItems.map((it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        options: it.options,
      })),
    });

    // Payment-required orders return no order_number yet (Task 1) — they route
    // to payment before getting a number. Non-payment orders flow to the
    // customer's live status page.
    if (result.orderNumber) {
      router.push(
        `/order/${result.boothId}/${result.orderNumber}?t=${result.accessToken}`,
      );
    } else {
      router.push(`/order/${result.boothId}/pay?t=${result.accessToken}`);
    }
  }

  const hasItems = cartItems.length > 0;
  const cartPriced = orderHasPricing(cartItems);
  const sections = groupByCategory(menuItems, menuCategories);
  const grouped = sections.length > 1;

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
      {/* Menu items */}
      {grouped ? (
        // On a phone the sections are a row of chips pinned above the menu,
        // so the items keep the full width; from md up they are a side rail.
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
          <nav
            aria-label="Menu sections"
            className="sticky top-0 z-10 -mx-5 flex gap-2 overflow-x-auto bg-background px-5 py-2 text-sm md:top-4 md:mx-0 md:max-h-[calc(100dvh-2rem)] md:w-40 md:shrink-0 md:flex-col md:gap-1.5 md:self-start md:overflow-x-visible md:overflow-y-auto md:bg-transparent md:p-0"
          >
            {sections.map((s) => {
              const thumb = s.items.find((it) => it.image_url)?.image_url;
              return (
                <a
                  key={s.id}
                  href={`#section-${s.id}`}
                  className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 font-medium text-muted-foreground md:rounded-lg md:bg-transparent md:p-2"
                >
                  {thumb && (
                    <div className="relative hidden size-9 shrink-0 overflow-hidden rounded-md border border-border md:block">
                      <MediaImage
                        src={thumb}
                        alt=""
                        fill
                        sizes="3rem"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <span className="whitespace-nowrap md:line-clamp-1 md:whitespace-normal">
                    {s.label}
                  </span>
                </a>
              );
            })}
          </nav>
          <div className="min-w-0 flex-1 space-y-8">
            {sections.map((s) => (
              <section
                key={s.id}
                id={`section-${s.id}`}
                className="scroll-mt-20 md:scroll-mt-4"
              >
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {s.label}
                </h2>
                <div className="space-y-2.5">{s.items.map(renderItemCard)}</div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Menu
          </h2>
          <div className="space-y-2.5">{menuItems.map(renderItemCard)}</div>
        </section>
      )}

      {/* Cart summary — collapsed by default so a long menu doesn't push the
          summary between the customer and the rest of the items. */}
      {hasItems && (
        <Ticket as="section" shadow="none" radius="xl">
          <button
            type="button"
            onClick={() => setCartExpanded((v) => !v)}
            aria-expanded={cartExpanded}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShoppingCart className="size-3.5" />
              Your order
            </span>
            <span className="flex items-center gap-2 font-mono text-sm font-semibold">
              {count(itemCount, "item")}
              {cartPriced && ` · ${formatPrice(total)}`}
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  cartExpanded && "rotate-180",
                )}
              />
            </span>
          </button>
          {cartExpanded && (
            <>
              <div className="perforation mx-4" />
              <div className="space-y-3 px-4 py-3">
                {cartEntries.map(([key, item]) => {
                  const options = formatOptions(item.options);
                  return (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        {options && (
                          <p className="truncate text-xs text-muted-foreground">
                            {options}
                          </p>
                        )}
                        {item.price_cents != null && (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {formatPrice(item.price_cents * item.quantity)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-11 rounded-lg"
                          onClick={() => decrement(key)}
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-4 text-center font-mono text-sm font-bold">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          className="size-11 rounded-lg"
                          onClick={() => increment(key)}
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {cartPriced && (
                <>
                  <div className="perforation mx-4" />
                  <div className="flex items-baseline justify-between px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Total
                    </span>
                    <span className="font-mono text-lg font-bold">
                      {formatPrice(total)}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </Ticket>
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

      <Sheet
        open={checkoutOpen}
        onOpenChange={(open) => {
          if (!submitting) setCheckoutOpen(open);
        }}
      >
        <SheetContent
          side="bottom"
          className="mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
          onOpenAutoFocus={focusCheckoutSheet}
        >
          <SheetHeader className="shrink-0 gap-1 pt-5 pb-3">
            <SheetTitle className="font-display text-xl font-semibold">
              Who&apos;s this for?
            </SheetTitle>
            <SheetDescription className="sr-only">
              Add your name to confirm this order.
            </SheetDescription>
          </SheetHeader>

          {hasItems && (
            <>
              <div className="perforation shrink-0" />
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2.5">
                {cartEntries.map(([key, item]) => {
                  const options = formatOptions(item.options);
                  return (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.quantity > 1 && (
                          <span className="font-mono font-semibold">
                            {item.quantity}×{" "}
                          </span>
                        )}
                        {item.name}
                        {options && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {options}
                          </span>
                        )}
                      </span>
                      {item.price_cents != null && (
                        <span className="shrink-0 font-mono text-muted-foreground">
                          {formatPrice(item.price_cents * item.quantity)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {cartPriced && (
                <>
                  <div className="perforation shrink-0" />
                  <div className="flex shrink-0 items-baseline justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Total
                    </span>
                    <span className="font-mono text-sm font-semibold">
                      {formatPrice(total)}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
          <div className="perforation shrink-0" />

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex shrink-0 flex-col gap-5 px-4 pt-4"
          >
            <section className="space-y-2.5">
              <Label
                htmlFor="customerName"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Your name
              </Label>
              <Input
                id="customerName"
                placeholder="So we can call you when it's ready"
                className="h-12 rounded-xl text-base"
                aria-invalid={!!errors.customerName}
                aria-describedby={
                  errors.customerName ? "customerName-error" : undefined
                }
                {...register("customerName")}
              />
              {errors.customerName && (
                <p
                  id="customerName-error"
                  className="text-sm font-medium text-destructive"
                >
                  {errors.customerName.message}
                </p>
              )}
            </section>

            <section className="space-y-2.5">
              <Label
                htmlFor="customerPhone"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Phone number (optional)
              </Label>
              <Input
                id="customerPhone"
                type="tel"
                placeholder="So we can recognize you next time"
                className="h-12 rounded-xl text-base"
                aria-invalid={!!errors.customerPhone}
                aria-describedby={
                  errors.customerPhone ? "customerPhone-error" : undefined
                }
                {...register("customerPhone")}
              />
              {errors.customerPhone && (
                <p
                  id="customerPhone-error"
                  className="text-sm font-medium text-destructive"
                >
                  {errors.customerPhone.message}
                </p>
              )}
            </section>

            <DataCollectionNotice purpose="identify your order and send you order updates" />

            <SheetFooter className="gap-2 px-0 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {submitError && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
                >
                  {submitError}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="h-14 w-full rounded-xl text-base font-semibold"
                disabled={submitting || !hasItems || closed}
              >
                {confirmLabel}
              </Button>
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full font-normal text-muted-foreground"
                  disabled={submitting}
                >
                  Back to menu
                </Button>
              </SheetClose>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ItemCustomizer
        item={customizing}
        onClose={() => setCustomizing(null)}
        onAdd={addConfigured}
      />
    </div>
  );
}
