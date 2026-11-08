"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ItemCustomizer } from "@/components/order/item-customizer";
import { cartTotal } from "@/lib/cart";
import { useCart } from "@/hooks/use-cart";
import { remainingFor, type Remaining } from "@/lib/stock";
import { count, formatPrice, orderHasPricing } from "@/lib/utils";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/schemas";
import { getWalkupMenu } from "./walkup-menu-actions";
import { placeWalkupOrder, type WalkupPayment } from "./walkup-actions";
import { confirmOrderPayment } from "./order-payment-actions";
import { WalkupPayStep } from "./walkup-pay-step";
import { WalkupMenuSection } from "./walkup-menu-grid";
import { WalkupOrderSummary } from "./walkup-order-summary";
import type { MenuItem, SelectedOption } from "@/lib/types";

interface Booth {
  id: string;
  name: string;
  // An event booth, where staff key in every order: the dialog stays open
  // for the next customer instead of closing after each one.
  walkup_default?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Active booths only. The caller (RealtimeOrderBoard) filters is_active
  // before offering this; a paused booth isn't a walk-up target.
  booths: Booth[];
  initialBoothId?: string;
  // The number staff will see on the ticket for an order just placed. The
  // board owns the day's numbering (daily reset shows #002 for permanent
  // number 0847); without this the dialog can only show the permanent one.
  displayNumber?: (boothId: string, orderNumber: string) => string;
  // Bracket each placement, so the board can tell its own walk-up's realtime
  // echo from a new order and skip the new-order alert for it. onPlaced gets
  // the permanent number, or null when the order was not placed.
  onPlacing?: () => void;
  onPlaced?: (boothId: string, orderNumber: string | null) => void;
}

const permanentNumber = (_boothId: string, orderNumber: string) => orderNumber;

// An order this dialog has placed and not yet been paid for. orderNumber is
// the number as shown on the ticket, not the permanent one.
interface PayStep extends WalkupPayment {
  orderNumber: string;
}

/**
 * Staff-entered order for a customer at the counter. Same menu/cart/pricing
 * rules as the customer's own ordering flow (place_walkup_order re-derives
 * every price server-side, migration 0061), deliberately NOT the same
 * payment UI: PayPanel is written in the customer's own voice ("waiting for
 * the stall to confirm") and polls for a claim the staff themselves would be
 * making, which reads wrong from this side.
 *
 * Two steps at a booth that takes payment. The order is placed first, unpaid,
 * and only then does the dialog turn into WalkupPayStep: the amount and the
 * booth's own QR, for staff to show the customer. Placing first is what makes
 * the QR possible at all (the amount on it is the server's total, and paykit
 * keys the transaction on the order's id), and it means closing the dialog
 * half-way loses nothing: the ticket is on the board with its own "Mark as
 * paid". A booth with no payment set up never sees the second step, or any
 * payment control.
 *
 * Once an order is done (placed, and paid or left for later) the dialog
 * closes, except at an event booth (walkup_default), where it clears for the
 * next customer: there the dialog is the till, and reopening it per order is
 * a wasted tap in a queue.
 *
 * Split-pane layout (menu left, order summary right) rather than a single
 * scrolling column: a staff member building a multi-item order needs to see
 * what's already in the cart and hit submit without scrolling past the whole
 * menu first. Panes stack on narrow screens, where there's no room for two
 * columns anyway.
 */
export function WalkupOrderDialog({
  open,
  onOpenChange,
  booths,
  initialBoothId,
  displayNumber = permanentNumber,
  onPlacing,
  onPlaced,
}: Props) {
  const [boothId, setBoothId] = useState(initialBoothId ?? booths[0]?.id ?? "");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [remaining, setRemaining] = useState<Remaining>({});
  const [expectsPayment, setExpectsPayment] = useState(false);
  const [payStep, setPayStep] = useState<PayStep | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const {
    cart,
    setCart,
    entries: cartEntries,
    items: cartItems,
    add: addLine,
    increment: incrementLine,
    decrement,
  } = useCart();
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Numbers each menu request, so a slow answer for an earlier booth, opening
  // or customer is dropped instead of overwriting the current one.
  const menuRequest = useRef(0);

  // Fresh state each time the dialog opens. A leftover cart/booth from the
  // last walk-up order has no business surviving into the next one.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the form resets when the dialog opens
    setBoothId(initialBoothId ?? booths[0]?.id ?? "");
    setCart(new Map());
    setCustomerName("");
    setPayStep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the open transition resets the dialog
  }, [open]);

  useEffect(() => {
    if (!open || !boothId) return;
    let active = true;
    menuRequest.current += 1;
    const request = menuRequest.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loading flag is set before the async menu fetch
    setLoadingMenu(true);
    setCart(new Map());

    void getWalkupMenu(boothId)
      .then((res) => {
        if (!active || menuRequest.current !== request) return;
        setMenuItems(res?.menuItems ?? []);
        setRemaining(res?.remaining ?? {});
        setExpectsPayment(res?.expectsPayment ?? false);
      })
      .catch(() => {
        if (!active || menuRequest.current !== request) return;
        setMenuItems([]);
        setRemaining({});
        setExpectsPayment(false);
        toast.error("Could not load the menu. Close and reopen to try again.");
      })
      .finally(() => {
        if (active) setLoadingMenu(false);
      });
    return () => {
      active = false;
    };
  }, [open, boothId, setCart]);

  function qtyInCartFor(menuItemId: string): number {
    let n = 0;
    for (const it of cart.values())
      if (it.menuItemId === menuItemId) n += it.quantity;
    return n;
  }

  function blockedByStock(menuItemId: string): boolean {
    const left = remainingFor(remaining, menuItemId);
    if (left === null) return false;
    if (qtyInCartFor(menuItemId) >= left) {
      toast.error(left <= 0 ? "Sold out" : `Only ${left} left`);
      return true;
    }
    return false;
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

  const staysOpen =
    booths.find((b) => b.id === boothId)?.walkup_default === true;

  // Clears the dialog for the next customer and re-reads stock behind it, with
  // no loading state: the menu on screen is still right, only the "N left"
  // counts may have moved. A failed refresh is left alone; place_walkup_order
  // checks stock again whatever the screen says.
  function nextCustomer() {
    setCart(new Map());
    setCustomerName("");
    setPayStep(null);
    menuRequest.current += 1;
    const request = menuRequest.current;

    void getWalkupMenu(boothId)
      .then((res) => {
        if (!res || menuRequest.current !== request) return;
        setMenuItems(res.menuItems);
        setRemaining(res.remaining);
        setExpectsPayment(res.expectsPayment);
      })
      .catch(() => {});
  }

  function finishOrder() {
    if (staysOpen) nextCustomer();
    else onOpenChange(false);
  }

  const total = cartTotal(cartItems);
  const itemCount = cartItems.reduce((n, it) => n + it.quantity, 0);
  const hasItems = cartItems.length > 0;
  const cartPriced = orderHasPricing(cartItems);

  let submitLabel: string;
  if (submitting) submitLabel = "Placing order…";
  else if (!hasItems) submitLabel = "Add items to order";
  else if (cartPriced)
    submitLabel = `Add order · ${count(itemCount, "item")} · ${formatPrice(total)}`;
  else submitLabel = `Add order · ${count(itemCount, "item")}`;

  async function onSubmit() {
    if (cartItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    const input: PlaceOrderInput = {
      customerName: customerName.trim() || "Walk-up",
      items: cartItems,
    };
    const parsed = placeOrderSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the order details");
      return;
    }
    setSubmitting(true);
    let placedNumber: string | null = null;
    onPlacing?.();
    try {
      const res = await placeWalkupOrder(boothId, parsed.data, false);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      placedNumber = res.orderNumber;
      const shown = displayNumber(boothId, res.orderNumber);
      toast.success(`Order #${shown} added to the board`);
      if (res.payment && res.payment.amountCents > 0)
        setPayStep({ ...res.payment, orderNumber: shown });
      else finishOrder();
    } catch {
      toast.error(
        "Could not confirm the order. Check the board before trying again.",
      );
    } finally {
      onPlaced?.(boothId, placedNumber);
      setSubmitting(false);
    }
  }

  async function onPaid(step: PayStep) {
    setConfirming(true);
    try {
      const res = await confirmOrderPayment(step.orderId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Order #${step.orderNumber} paid`);
      finishOrder();
    } catch {
      toast.error(
        "Could not confirm the payment. Mark it as paid from the ticket on the board.",
      );
    } finally {
      setConfirming(false);
    }
  }

  const multiBooth = booths.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl md:h-[640px] md:max-h-[85vh]"
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>
            {payStep
              ? `Collect payment for order #${payStep.orderNumber}`
              : "New walk-up order"}
          </DialogTitle>
          <DialogDescription>
            {payStep
              ? "The order is on the board. Turn this screen to your customer."
              : "For a customer ordering at the counter, with the same menu and pricing as an online order."}
          </DialogDescription>
        </DialogHeader>

        {payStep && (
          <WalkupPayStep
            amountCents={payStep.amountCents}
            checkout={payStep.checkout}
            confirming={confirming}
            onPaid={() => onPaid(payStep)}
            onLater={finishOrder}
          />
        )}

        {!payStep && (
          <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
            {/* Menu pane */}
            <div className="flex-1 space-y-4 p-6 md:overflow-y-auto">
              {multiBooth && (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="walkup-booth"
                    className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    Booth
                  </Label>
                  <Select value={boothId} onValueChange={setBoothId}>
                    <SelectTrigger
                      id="walkup-booth"
                      aria-label="Booth"
                      className="h-10 w-full rounded-xl sm:w-64"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {booths.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <WalkupMenuSection
                boothCount={booths.length}
                loading={loadingMenu}
                menuItems={menuItems}
                cart={cart}
                remaining={remaining}
                onDecrement={decrement}
                onIncrement={increment}
                onAddClick={onAddClick}
              />
            </div>

            {/* Sticky within its own column on md+, so a staff member never
              has to scroll past the whole menu to see the order or submit. */}
            <WalkupOrderSummary
              entries={cartEntries}
              itemCount={itemCount}
              total={total}
              priced={cartPriced}
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              expectsPayment={expectsPayment}
              submitLabel={submitLabel}
              submitDisabled={submitting || !hasItems}
              onDecrement={decrement}
              onIncrement={increment}
              onSubmit={onSubmit}
            />
          </div>
        )}

        <ItemCustomizer
          item={customizing}
          onClose={() => setCustomizing(null)}
          onAdd={addConfigured}
        />
      </DialogContent>
    </Dialog>
  );
}
