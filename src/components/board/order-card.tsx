"use client";

import { useState, type MouseEvent, memo, useMemo } from "react";
import { Ticket } from "@/components/widgets/ticket";
import { parseOrderItems } from "@/lib/schemas";
import { cn, formatPrice, orderHasPricing } from "@/lib/utils";
import { isTerminal, type AgeTone } from "@/lib/orders";
import { ticketAttention, type OptionCodes } from "@/lib/ticket";
import { useNow } from "@/hooks/use-now";
import type { BoardOrder, OrderStatus } from "@/lib/types";
import { TicketActions, TicketItems } from "./order-card-parts";
import { AttentionLine, TicketFooter, ticketAge } from "./order-card-footer";
import { CancelOrderDialog } from "./order-card-cancel-dialog";
import { TicketHeading } from "./order-card-heading";
import { useAutoClearCountdown } from "./use-auto-clear-countdown";
import { useOrderCardActions } from "./use-order-card-actions";

// Undo window for advanceStatus (Mark Ready / Mark Picked Up) — instant tap,
// no hold-to-confirm gate (research: confirmation friction on a high-frequency
// action causes habituation and increases errors instead of preventing them),
// backed instead by a short, visible undo. Matches Square KDS's own 3s undo on
// its equivalent complete action; vendor-configurable (board_settings.
// undo_seconds) via the `undoMs` prop, this 4s is just the fallback.
const DEFAULT_UNDO_MS = 4000;

/** A tap that landed on a control inside the ticket, which handles it itself. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, a, input, label, [role='menuitem']") !== null
  );
}

function ticketSelectClass(selectable: boolean, selected: boolean) {
  if (!selectable) return undefined;
  return selected ? "cursor-pointer ring-2 ring-primary" : "cursor-pointer";
}

// While tickets are being ticked, the whole ticket is the target, not the
// 16px box. Taps on its own buttons and links still do their job.
function ticketTapHandler(
  selectable: boolean,
  onToggleSelect: ((orderId: string) => void) | undefined,
  orderId: string,
) {
  if (!selectable || !onToggleSelect) return undefined;
  return (event: MouseEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) return;
    onToggleSelect(orderId);
  };
}

// One full-card attention wash at a time, by priority. A background (not a
// border) so the colour reaches the scalloped receipt top edge instead of
// being broken by it; plain .ticket-* classes so they beat .ticket's own
// unlayered background. Overdue (late food) outranks an unconfirmed payment,
// which outranks merely aging.
function ticketWash(closed: boolean, tone: AgeTone, payStatus: string) {
  if (!closed && tone === "overdue") return "ticket-overdue";
  if (payStatus === "claimed") return "ticket-alert";
  if (!closed && tone === "aging") return "ticket-aging";
  return "border-border";
}

// No cancel once payment is confirmed. There is no refund rail, so a paid
// order can only be refunded off-platform, and the server action rejects the
// cancel too.
function dueLabel(priced: boolean, totalCents: number) {
  return priced ? formatPrice(totalCents) : null;
}

function cancelAllowed(
  order: BoardOrder,
  status: OrderStatus,
  payStatus: string,
) {
  return (
    payStatus !== "confirmed" &&
    status !== "cancelled" &&
    (!isTerminal(status) || order.auto_completed)
  );
}

function OrderCardInner({
  order,
  displayNumber,
  overtaken = false,
  optionCodes,
  boothName,
  boothColor,
  agingMin,
  overdueMin,
  onUndoWindowChange,
  showDate = false,
  undoMs = DEFAULT_UNDO_MS,
  readyAutoClearMs = null,
  selectable = false,
  selected = false,
  onToggleSelect,
  awaitingArrival = false,
}: {
  order: BoardOrder;
  // board_settings.daily_order_number_reset display number (see
  // displayOrderNumber in @/lib/orders) — falls back to the real, permanent
  // order_number when omitted (e.g. the completed-orders history list, which
  // deliberately never gets one; see its own README for why).
  displayNumber?: string;
  // A later order from the same booth is already ready or collected, so this
  // one may have been finished without anyone marking it (see
  // overtakenOrderIds in @/lib/orders).
  overtaken?: boolean;
  // The booth's own short codes for option choices (see buildOptionCodes in
  // @/lib/ticket). A choice with no code prints in full, so this is optional.
  optionCodes?: OptionCodes;
  boothName?: string;
  // The booth's dot colour, from the board's boothColors(), so it matches the
  // dot in the booth filter.
  boothColor?: string;
  // Vendor-configurable board_settings thresholds (see /dashboard/settings).
  // Fall through to orderAgeTone's own defaults when not supplied.
  agingMin?: number;
  overdueMin?: number;
  // Notifies the board while an advance's undo window is open, so it can
  // keep a just-completed order (a terminal status, normally filtered off
  // the active board) visible until the window closes — otherwise the
  // realtime echo of the very advance being undone could unmount this card
  // out from under the undo button. No-op when omitted (e.g. the completed-
  // orders history list, which never calls advanceStatus in the first place).
  onUndoWindowChange?: (orderId: string, active: boolean) => void;
  // board_settings.undo_seconds * 1000, vendor-configurable. Falls back to
  // DEFAULT_UNDO_MS when omitted (e.g. before the board thread it through).
  undoMs?: number;
  // board_settings.ready_auto_clear_min * 60_000, vendor-configurable — null
  // (the default) when the vendor hasn't turned auto-clear on, or when this
  // card is rendered somewhere that doesn't apply it (e.g. the completed-
  // orders history list). Drives the drain bar on "Mark Picked Up" (see
  // useAutoClearCountdown); the actual sweep is server-side
  // (sweepReadyOrders) — this is display only, never authoritative.
  readyAutoClearMs?: number | null;
  // The history list's view of a ticket: a date and time stamp, each line's
  // price and the total. The live board shows none of that. Whoever is making
  // the order needs the number, the name and the drinks, and how long it has
  // waited is in the ticket's bottom corner.
  showDate?: boolean;
  // Board-level batch-mark-ready mode: when true, a selection checkbox
  // renders instead of nothing (the board only sets this for `preparing`
  // orders — the batch action's target status). Selection state/toggling
  // lives on the board (RealtimeOrderBoard), not here, so it survives
  // across every card's own independent re-renders.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (orderId: string) => void;
  // The booth waits for the customer's "I'm here" tap
  // (requires_arrival_confirm), so a pending order is waiting on the
  // customer, not on staff. "Start now" stays as the override for a customer
  // who turned up without tapping.
  awaitingArrival?: boolean;
}) {
  const {
    status,
    payStatus,
    bumped,
    updating,
    pendingUndo,
    advanceStatus,
    undoAdvance,
    confirmPayment,
    confirmPaymentAndStart,
    declinePayment,
    bump,
    restoreToReady,
    cancel,
  } = useOrderCardActions({ order, undoMs, onUndoWindowChange });
  const [cancelOpen, setCancelOpen] = useState(false);

  // Ticket aging: tick the clock each 30s (only while live) so the vendor sees
  // at a glance how long an order has waited against a ~10-min prep target.
  // nowMs is null until mounted (hydration-safe, see useNow): the card SSRs
  // with no elapsed label and a "fresh" tone, then fills in on the client.
  const nowMs = useNow(30_000, !isTerminal(status));
  const { tone, ageMins } = ticketAge(
    nowMs,
    { createdAt: order.created_at, status },
    { agingMin, overdueMin },
  );
  const items = useMemo(() => parseOrderItems(order.items), [order.items]);
  const priced = orderHasPricing(items);
  // What's actually printed on this ticket — the daily-reset display number
  // when supplied, else the real one. Used everywhere the card refers to
  // "this order" by number, including its own confirm dialogs: a vendor
  // reading "order #3" off the card shouldn't then see "#0847" in the
  // dialog asking them to confirm it.
  const number = displayNumber ?? order.order_number;
  const remainingAutoClearMs = useAutoClearCountdown(
    readyAutoClearMs,
    status,
    order.ready_at,
  );

  const closed = isTerminal(status);
  const attention = ticketAttention({
    status,
    paymentStatus: payStatus,
    printStatus: order.print_status,
    overtaken,
  });
  // What the customer owes, printed on the payment buttons themselves: the one
  // moment on the live board where the amount is the thing being checked.
  const amountDue = dueLabel(priced, order.total_cents);
  const canCancel = cancelAllowed(order, status, payStatus);
  const canBump = !closed && !bumped;

  return (
    <Ticket
      radius="xl"
      shadow="none"
      borderColor="custom"
      className={cn(
        "flex w-full flex-col shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]",
        ticketWash(closed, tone, payStatus),
        ticketSelectClass(selectable, selected),
      )}
      onClick={ticketTapHandler(selectable, onToggleSelect, order.id)}
    >
      <TicketHeading
        order={order}
        number={number}
        status={status}
        closed={closed}
        bumped={bumped}
        boothName={boothName}
        boothColor={boothColor}
        selectable={selectable}
        selected={selected}
        onToggleSelect={onToggleSelect}
        menuDisabled={updating}
        onBump={canBump ? bump : undefined}
        onCancel={canCancel ? () => setCancelOpen(true) : undefined}
      />

      {attention && <AttentionLine attention={attention} />}

      <div className="perforation mx-4" />

      <TicketItems
        items={items}
        optionCodes={optionCodes}
        showPrices={showDate && priced}
      />

      <TicketActions
        order={order}
        status={status}
        payStatus={payStatus}
        updating={updating}
        amountDue={amountDue}
        pendingUndo={pendingUndo}
        undoMs={undoMs}
        remainingAutoClearMs={remainingAutoClearMs}
        showDate={showDate}
        onConfirmPayment={confirmPayment}
        onConfirmPaymentAndStart={confirmPaymentAndStart}
        onDeclinePayment={declinePayment}
        onAdvance={advanceStatus}
        onUndo={undoAdvance}
        onRestore={restoreToReady}
      />

      {!closed && (
        <TicketFooter
          ageMins={ageMins}
          tone={tone}
          status={status}
          awaitingArrival={awaitingArrival}
        />
      )}

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        number={number}
        closed={closed}
        onConfirm={cancel}
      />
    </Ticket>
  );
}

/**
 * A ticket re-renders when its own order or settings change, not each time the
 * board does. The board re-renders on every realtime event, every tick of a
 * selection and every toast, and on a busy day it holds dozens of tickets;
 * each of the board's props to a ticket is a primitive, a stable callback or
 * the order object the realtime hook replaces only when that order changes.
 */
export const OrderCard = memo(OrderCardInner);
