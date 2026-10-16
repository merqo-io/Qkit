"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  memo,
  useMemo,
} from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderStatusBadge } from "@/components/board/order-status-badge";
import { Ticket } from "@/components/widgets/ticket";
import { parseOrderItems } from "@/lib/schemas";
import { cn, formatPrice, orderHasPricing } from "@/lib/utils";
import { boothDotTitle } from "@/lib/booth/color";
import {
  ADVANCE,
  ageLabel,
  isTerminal,
  orderAgeTone,
  elapsedMinutes,
  splitTrailingDigit,
  type AgeTone,
} from "@/lib/orders";
import {
  ticketAttention,
  type OptionCodes,
  type TicketAttention,
} from "@/lib/ticket";
import {
  advanceOrder,
  bumpOrder,
  cancelOrder as cancelOrderAction,
  confirmOrderPayment,
  confirmPaymentAndStart,
  declinePaymentClaim,
  revertOrderAdvance,
  revertPaymentAndStart,
  restoreAutoCompleted,
} from "@/app/dashboard/order-actions";
import { useNow } from "@/hooks/use-now";
import { useAsyncAction } from "@/hooks/use-async-action";
import { AlertTriangle, Banknote, Clock, Printer, Zap } from "lucide-react";
import type { BoardOrder, OrderStatus } from "@/lib/types";
import {
  TicketActions,
  TicketItems,
  TicketMenu,
  type PendingUndo,
} from "./order-card-parts";

// Undo window for advanceStatus (Mark Ready / Mark Picked Up) — instant tap,
// no hold-to-confirm gate (research: confirmation friction on a high-frequency
// action causes habituation and increases errors instead of preventing them),
// backed instead by a short, visible undo. Matches Square KDS's own 3s undo on
// its equivalent complete action; vendor-configurable (board_settings.
// undo_seconds) via the `undoMs` prop, this 4s is just the fallback.
const DEFAULT_UNDO_MS = 4000;

const ATTENTION_ICON: Record<TicketAttention["kind"], typeof AlertTriangle> = {
  payment_claimed: Banknote,
  print_failed: Printer,
  overtaken: AlertTriangle,
  unpaid: Banknote,
};

// The ticket's bottom strip, under the action button and away from the number
// and name, so the top of the ticket carries only what gets read out and the
// "more" menu. Bottom-left is how long the order has waited; bottom-right is
// its status, when it is anything other than the unsaid "Preparing". The time
// is absent before mount (ageMins is null until then, see useNow).
function TicketFooter({
  ageMins,
  tone,
  status,
}: {
  ageMins: number | null;
  tone: AgeTone;
  status: OrderStatus;
}) {
  const showStatus = status !== "preparing";
  if (ageMins == null && !showStatus) return null;
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border/60 px-4 py-2">
      {ageMins != null ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums",
            ageToneClass(tone),
          )}
          title="Time since the order arrived"
          aria-label={`${ageMins} minutes since arrival${ageToneAriaSuffix(tone)}`}
        >
          {tone === "overdue" ? (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          ) : (
            <Clock className="size-3.5" aria-hidden="true" />
          )}
          {ageLabel(ageMins)}
          {/* A word and its own icon, so a late ticket does not rest on the
              difference between amber and red. */}
          {tone === "overdue" && <span aria-hidden="true">· Late</span>}
        </span>
      ) : (
        <span />
      )}
      {/* One line whatever the column width: a wrapped "Waiting for you"
          would make an Incoming ticket taller than its neighbours. */}
      {showStatus && (
        <span className="shrink-0 whitespace-nowrap">
          <OrderStatusBadge status={status} />
        </span>
      )}
    </div>
  );
}

// The ticket's single attention line (see ticketAttention): one message, never
// a stack of pills. Filled only for the case that needs the vendor to act; the
// rest sit on a quiet tint so an ordinary rush is not a wall of alarms.
function AttentionLine({ attention }: { attention: TicketAttention }) {
  const Icon = ATTENTION_ICON[attention.kind];
  return (
    <p
      className={cn(
        "mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm leading-tight font-semibold",
        attention.tone === "action"
          ? "bg-status-payment-claimed text-white"
          : "bg-foreground/[0.06] text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {attention.label}
    </p>
  );
}

/**
 * Ticket-aging tone + elapsed minutes. `nowMs` is null before mount (see
 * useNow), which yields no label and a "fresh" tone. Pending is pre-arrival
 * (arrival-confirmation booth, customer hasn't tapped "I'm here" yet), so it
 * is forced "fresh" too: nothing is cooking or waiting yet, and a pending
 * order must never get the amber/red wash meant for food getting cold.
 */
function ticketAge(
  nowMs: number | null,
  createdAt: string,
  status: OrderStatus,
  agingMin: number | undefined,
  overdueMin: number | undefined,
): { tone: AgeTone; ageMins: number | null } {
  if (nowMs == null) return { tone: "fresh", ageMins: null };
  const elapsedMs = nowMs - Date.parse(createdAt);
  return {
    tone:
      status === "pending"
        ? "fresh"
        : orderAgeTone(elapsedMs, agingMin, overdueMin),
    ageMins: elapsedMinutes(elapsedMs),
  };
}

function ageToneClass(tone: AgeTone): string {
  if (tone === "overdue") return "text-status-cancelled";
  if (tone === "aging") return "text-status-aging";
  return "text-muted-foreground";
}

function ageToneAriaSuffix(tone: AgeTone): string {
  if (tone === "overdue") return ", overdue";
  if (tone === "aging") return ", getting old";
  return "";
}

function revertPendingUndo(orderId: string, pending: PendingUndo) {
  return pending.action === "paymentAndStart"
    ? revertPaymentAndStart(orderId, pending.prevPaymentStatus)
    : revertOrderAdvance(
        orderId,
        pending.revertTo,
        pending.revertFrom,
        pending.prevPaymentStatus,
      );
}

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

function showsWalkupTag(order: BoardOrder): boolean {
  return (
    order.source === "walkup" &&
    order.customer_name.trim().toLowerCase() !== "walk-up"
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
  // remainingAutoClearMs below); the actual sweep is server-side
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
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  // Resync to the (realtime-updated) prop when it actually changes value, so a
  // remote status change (another device advancing/cancelling) reflects on the
  // card. An optimistic local setStatus doesn't change the prop, so it survives
  // until its own realtime echo arrives and this no-ops.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(order.status);
  }, [order.status]);
  // Payment status is driven by the (realtime-updated) prop so a customer's
  // remote "I've paid" claim appears live on the board. A local flag only
  // covers the vendor's own confirm tap for instant feedback before the
  // realtime echo arrives.
  const [confirmedLocally, setConfirmedLocally] = useState(false);
  const payStatus = confirmedLocally ? "confirmed" : order.payment_status;
  // Same optimistic-then-realtime-confirmed pattern as confirmedLocally above —
  // an instant "bumped" state for the vendor who tapped it, superseded by the
  // realtime-updated prop once that echo arrives (or reflecting another
  // session's bump immediately, without waiting on this one's own tap).
  const [bumpedLocally, setBumpedLocally] = useState(false);
  const bumped = bumpedLocally || order.priority_bumped_at != null;
  const { pending: updating, run } = useAsyncAction();
  const [cancelOpen, setCancelOpen] = useState(false);

  // A just-tapped advanceStatus sits here until the undo window closes (timer
  // in undoTimerRef) or the vendor taps Undo. Cleared on unmount too, so a
  // card that scrolls out of view (or the completed order finally leaving the
  // board once the window ends) never fires a late setState.
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Ticket aging: tick the clock each 30s (only while live) so the vendor sees
  // at a glance how long an order has waited against a ~10-min prep target.
  // nowMs is null until mounted (hydration-safe, see useNow): the card SSRs
  // with no elapsed label and a "fresh" tone, then fills in on the client.
  const nowMs = useNow(30_000, !isTerminal(status));
  const { tone, ageMins } = ticketAge(
    nowMs,
    order.created_at,
    status,
    agingMin,
    overdueMin,
  );
  const items = useMemo(() => parseOrderItems(order.items), [order.items]);
  const priced = orderHasPricing(items);
  // What's actually printed on this ticket — the daily-reset display number
  // when supplied, else the real one. Used everywhere the card refers to
  // "this order" by number, including its own confirm dialogs: a vendor
  // reading "order #3" off the card shouldn't then see "#0847" in the
  // dialog asking them to confirm it.
  const number = displayNumber ?? order.order_number;
  const numberSplit = splitTrailingDigit(number);

  // Time left before sweepReadyOrders auto-completes this order, for the
  // "Mark Picked Up" drain bar. Set once per ready_at (the effect only
  // re-runs when these deps actually change, not on every poll tick) so the
  // CSS animation drains smoothly from a fixed duration instead of
  // restarting each time this card re-renders — the actual clearing is
  // still entirely server-side; a stale/frozen value here only ever makes
  // the bar a few seconds off, never wrong about whether the order clears.
  // null hides the bar (auto-clear off, no ready_at yet, or already past
  // due — the next sweep poll will complete it any moment).
  const [remainingAutoClearMs, setRemainingAutoClearMs] = useState<
    number | null
  >(null);
  useEffect(() => {
    if (readyAutoClearMs == null || status !== "ready" || !order.ready_at) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingAutoClearMs(null);
      return;
    }
    const remaining =
      readyAutoClearMs - (Date.now() - Date.parse(order.ready_at));
    setRemainingAutoClearMs(remaining > 0 ? remaining : null);
  }, [readyAutoClearMs, status, order.ready_at]);

  // A dismissed/expired undo window just clears local state — the DB write
  // it's undoing (or not) already happened; there's nothing left to do here.
  function dismissUndo(orderId: string) {
    setPendingUndo(null);
    onUndoWindowChange?.(orderId, false);
  }

  // All mutations go through validated server actions (order-actions.ts); the
  // DB enforces ownership (RLS) and column integrity (a freeze trigger).
  function advanceStatus() {
    if (!ADVANCE[status]) return;
    const revertTo = status;
    const prevPaymentStatus = order.payment_status;
    return run(async () => {
      const res = await advanceOrder(order.id, revertTo);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus(res.status);
        // Instant tap, no confirm gate — a short undo window is the recovery
        // path instead (see undoMs). onUndoWindowChange keeps a just-
        // completed order on the active board for this window; without it,
        // the realtime echo of this very write would filter the card off the
        // board before the vendor could react to a mis-tap.
        setPendingUndo({
          revertTo,
          revertFrom: res.status,
          prevPaymentStatus,
          action: "advance",
        });
        onUndoWindowChange?.(order.id, true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => dismissUndo(order.id), undoMs);
      }
    });
  }

  function undoAdvance() {
    if (!pendingUndo) return;
    const pending = pendingUndo;
    const orderId = order.id;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    return run(async () => {
      const res = await revertPendingUndo(orderId, pending);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus(res.status);
        // Undo only un-starts the order here — the payment half already went
        // through paykit for real and can't be undone (same principle as
        // cancelOrder's "Refund the customer directly" on a confirmed
        // payment), so make that explicit rather than let the vendor assume
        // "Undo" also unconfirmed the payment.
        if (pending.action === "paymentAndStart")
          toast.success(
            "Payment stays confirmed. Refund via paykit if needed.",
          );
      }
      // Clearing the local pendingUndo is enough to restore this card's own
      // buttons — status is no longer terminal, so `closed` already flips
      // false. Releasing the board's keep-alive override is delayed instead
      // of immediate: the board's `orders` (realtime-sourced) still reads
      // "completed" until THIS revert's own echo lands, so releasing right
      // away risks a one-frame flicker where the card gets filtered off the
      // board before it flips back.
      setPendingUndo(null);
      setTimeout(() => onUndoWindowChange?.(orderId, false), 1000);
    });
  }

  function confirmPayment() {
    return run(async () => {
      const res = await confirmOrderPayment(order.id);
      if (!res.success) toast.error(res.error);
      else setConfirmedLocally(true);
    });
  }

  // Reconciled "Mark paid & start" review action: there's no real scenario
  // where a vendor confirms payment on a still-pending order without also
  // starting it, so one tap does both atomically instead of two separate
  // taps (Confirm payment received + Start now).
  function confirmPaymentAndStartHandler() {
    return run(async () => {
      const res = await confirmPaymentAndStart(order.id);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus(res.status);
        setConfirmedLocally(true);
        setPendingUndo({
          revertTo: "pending",
          revertFrom: res.status,
          prevPaymentStatus: res.prevPaymentStatus,
          action: "paymentAndStart",
        });
        onUndoWindowChange?.(order.id, true);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => dismissUndo(order.id), undoMs);
      }
    });
  }

  // The customer's claim goes back to unpaid; the order itself is untouched,
  // so they can pay again. The payment status prop follows via realtime.
  function declinePayment() {
    return run(async () => {
      const res = await declinePaymentClaim(order.id);
      if (!res.success) toast.error(res.error);
    });
  }

  function cancelOrder() {
    return run(async () => {
      const res = await cancelOrderAction(order.id);
      if (!res.success) {
        toast.error(res.error);
      } else {
        setStatus("cancelled");
      }
    });
  }

  function bump() {
    return run(async () => {
      const res = await bumpOrder(order.id);
      if (!res.success) toast.error(res.error);
      else setBumpedLocally(true);
    });
  }

  function restoreToReady() {
    return run(async () => {
      const res = await restoreAutoCompleted(order.id);
      if (!res.success) toast.error(res.error);
      else setStatus(res.status);
    });
  }

  const closed = isTerminal(status);
  const attention = ticketAttention({
    status,
    paymentStatus: payStatus,
    printStatus: order.print_status,
    overtaken,
  });
  // What the customer owes, printed on the payment buttons themselves: the one
  // moment on the live board where the amount is the thing being checked.
  const amountDue = priced ? formatPrice(order.total_cents) : null;
  // No cancel once payment is confirmed. There is no refund rail, so a paid
  // order can only be refunded off-platform, and the server action rejects the
  // cancel too.
  const canCancel =
    payStatus !== "confirmed" &&
    status !== "cancelled" &&
    (!closed || order.auto_completed);
  const canBump = !closed && !bumped;

  // One full-card attention wash at a time, by priority. A background (not a
  // border) so the colour reaches the scalloped receipt top edge instead of
  // being broken by it; plain .ticket-* classes so they beat .ticket's own
  // unlayered background. Overdue (late food) outranks an unconfirmed payment,
  // which outranks merely aging.
  let wash: string;
  if (!closed && tone === "overdue") wash = "ticket-overdue";
  else if (payStatus === "claimed") wash = "ticket-alert";
  else if (!closed && tone === "aging") wash = "ticket-aging";
  else wash = "border-border";

  return (
    <Ticket
      radius="xl"
      shadow="none"
      borderColor="custom"
      className={cn(
        "flex w-full flex-col shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]",
        wash,
        ticketSelectClass(selectable, selected),
      )}
      onClick={ticketTapHandler(selectable, onToggleSelect, order.id)}
    >
      <div className="flex items-start gap-3 px-4 pt-5 pb-3">
        {selectable && (
          // The label is the touch target: the box itself is 16px, far too
          // small to hit mid-service, so the padding around it (pulled back
          // with a matching negative margin, leaving the layout as it was)
          // makes 44px of it tappable.
          <label className="-m-3.5 flex shrink-0 cursor-pointer p-3.5">
            <Checkbox
              className="mt-1.5"
              checked={selected}
              onCheckedChange={() => onToggleSelect?.(order.id)}
              aria-label={`Select order #${number}`}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          {/* Only in multi-booth view. Same boothColors() colour as the board's
              filter, so the colour still carries onto the ticket, but as one
              quiet line: the number below is what gets called out. */}
          {boothName && (
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: boothColor }}
                title={boothDotTitle(boothName)}
                aria-hidden="true"
              />
              <span className="truncate">{boothName}</span>
            </p>
          )}
          {/* The number is the most-scanned thing on the board, read
              one-handed and often with wet hands, so it is the largest thing
              on the ticket and nothing else competes with it. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="font-mono text-3xl leading-none font-bold tracking-tight">
              #{numberSplit.lead}
              {/* Emphasized: staff slotting a pickup by a physical shelf's
                  last-digit position (bubble-tea-chain style) read this digit
                  first. */}
              <span className="text-primary">{numberSplit.last}</span>
            </h3>
            {!closed && bumped && (
              <Zap
                className="size-4 shrink-0 text-primary"
                aria-label="Manually bumped to the front of the queue"
              />
            )}
            {/* A live ticket's status sits in its bottom strip (see
                TicketFooter). A closed ticket has no strip, so its outcome
                stays up here. */}
            {closed && <OrderStatusBadge status={status} />}
          </div>
          {/* Wrapped, not truncated: this name is what staff write on the cup
              and call out, so a cut-off one is a mix-up waiting to happen. A
              walk-up has no phone to notify, so staff need to know to call
              it. */}
          <p className="mt-1.5 text-base leading-snug font-medium break-words">
            {order.customer_name}
            {showsWalkupTag(order) && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · walk-up
              </span>
            )}
          </p>
        </div>
        <TicketMenu
          number={number}
          disabled={updating}
          onBump={canBump ? bump : undefined}
          onCancel={canCancel ? () => setCancelOpen(true) : undefined}
        />
      </div>

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
        onConfirmPaymentAndStart={confirmPaymentAndStartHandler}
        onDeclinePayment={declinePayment}
        onAdvance={advanceStatus}
        onUndo={undoAdvance}
        onRestore={restoreToReady}
      />

      {!closed && (
        <TicketFooter ageMins={ageMins} tone={tone} status={status} />
      )}

      {/* Opened from the "more" menu. An auto-completed order gets its own
          wording: the auto-clear sweep can beat a vendor's own cancel tap, and
          cancelOrder accepts that case specifically (see its own comment). */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order #{number}?</AlertDialogTitle>
            <AlertDialogDescription>
              {closed
                ? "This order was auto-completed before you cancelled it. Cancelling now permanently removes it from the board. This can't be undone."
                : "This permanently cancels the order and removes it from the board. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>
              Keep order
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={cancelOrder}
              disabled={updating}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
