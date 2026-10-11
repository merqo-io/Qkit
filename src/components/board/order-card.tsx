"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderStatusBadge } from "@/components/board/order-status-badge";
import { Ticket } from "@/components/widgets/ticket";
import { parseOrderItems } from "@/lib/schemas";
import { cn, formatPrice, orderHasPricing } from "@/lib/utils";
import { boothColor } from "@/lib/booth/color";
import {
  ADVANCE,
  ageLabel,
  isTerminal,
  needsPaymentReview,
  orderAgeTone,
  elapsedMinutes,
  splitTrailingDigit,
  type AgeTone,
} from "@/lib/orders";
import {
  ticketAttention,
  ticketOptions,
  type OptionCodes,
  type TicketAttention,
} from "@/lib/ticket";
import {
  advanceOrder,
  bumpOrder,
  cancelOrder as cancelOrderAction,
  confirmOrderPayment,
  confirmPaymentAndStart,
  revertOrderAdvance,
  revertPaymentAndStart,
  restoreAutoCompleted,
} from "@/app/dashboard/order-actions";
import { shortDateTime } from "@/lib/tz";
import { useNow } from "@/hooks/use-now";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  AlertTriangle,
  Banknote,
  Clock,
  ImageIcon,
  MoreHorizontal,
  Printer,
  Undo2,
  Zap,
} from "lucide-react";
import type { BoardOrder, OrderStatus, PaymentStatus } from "@/lib/types";

// Heavy (pulls in tesseract.js on demand once opened) — code-split out of the
// board's initial bundle, same next/dynamic pattern as PayPanel.
const PaymentProofViewer = dynamic(() =>
  import("./payment-proof-viewer").then((m) => m.PaymentProofViewer),
);

// Undo window for advanceStatus (Mark Ready / Mark Picked Up) — instant tap,
// no hold-to-confirm gate (research: confirmation friction on a high-frequency
// action causes habituation and increases errors instead of preventing them),
// backed instead by a short, visible undo. Matches Square KDS's own 3s undo on
// its equivalent complete action; vendor-configurable (board_settings.
// undo_seconds) via the `undoMs` prop, this 4s is just the fallback.
const DEFAULT_UNDO_MS = 4000;

// Tap-to-expand proof-photo review, factored out of OrderCard's own render to
// keep its cognitive complexity down. Renders only when the caller has
// already established there's a claimed, un-reviewed proof photo to show.
function ProofPhotoTrigger({
  order,
  expanded,
  onToggle,
}: {
  order: BoardOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        <ImageIcon className="size-3.5" aria-hidden="true" />
        {expanded ? "Hide payment proof" : "View payment proof"}
      </button>
      {expanded && (
        <div className="mt-2">
          <PaymentProofViewer
            orderId={order.id}
            expectedAmountCents={order.total_cents}
          />
        </div>
      )}
    </div>
  );
}

const ATTENTION_ICON: Record<TicketAttention["kind"], typeof AlertTriangle> = {
  payment_claimed: Banknote,
  print_failed: Printer,
  overtaken: AlertTriangle,
  unpaid: Banknote,
};

// How long the order has waited, in the ticket's bottom-left corner. It sits
// under the action button, away from the number and name, so the top of the
// ticket carries only what gets read out and the "more" menu. The right-hand
// corner of the strip is left free on purpose. Renders nothing before mount
// (ageMins is null until then, see useNow).
function TicketAge({
  ageMins,
  tone,
}: {
  ageMins: number | null;
  tone: AgeTone;
}) {
  if (ageMins == null) return null;
  return (
    <div className="flex items-center border-t border-border/60 px-4 py-2">
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

type PendingUndo = {
  revertTo: OrderStatus;
  revertFrom: OrderStatus;
  prevPaymentStatus: PaymentStatus;
  // Which action this undo reverts — advanceOrder's plain transition, or
  // confirmPaymentAndStart's merged one, which needs its own revert function
  // (see revertPaymentAndStart's own doc comment for why).
  action: "advance" | "paymentAndStart";
};

/** Dispatch a pending undo to the server action that made the original change. */
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

export function OrderCard({
  order,
  displayNumber,
  overtaken = false,
  optionCodes,
  boothName,
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
  const items = parseOrderItems(order.items);
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
          {/* Only in multi-booth view. Same boothColor() hash as the board's
              filter, so the colour still carries onto the ticket, but as one
              quiet line: the number below is what gets called out. */}
          {boothName && (
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: boothColor(order.booth_id) }}
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
            {/* "Preparing" is what a ticket on the board is unless told
                otherwise, so it goes unsaid. Only the states that change what
                staff do next are named. */}
            {status !== "preparing" && <OrderStatusBadge status={status} />}
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
        onAdvance={advanceStatus}
        onUndo={undoAdvance}
        onRestore={restoreToReady}
      />

      {!closed && <TicketAge ageMins={ageMins} tone={tone} />}

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

// The payment buttons carry the longest labels on the ticket ("Confirm payment
// received" plus the amount). On a narrow card, three across on a tablet, one
// line of that overflowed the button, so these wrap and grow instead: a
// minimum of the usual height, never a fixed one.
const PAYMENT_BUTTON =
  "h-auto min-h-12 w-full rounded-lg bg-status-payment-claimed py-2 text-left text-base leading-tight font-bold whitespace-normal text-white hover:bg-status-payment-claimed/90";

// The amount owed, set off at the far end of a payment button. Absent for an
// order with no prices, where there is nothing to check.
function AmountDue({ amount }: { amount: string | null }) {
  if (amount == null) return null;
  return <span className="ml-auto pl-3 font-mono tabular-nums">{amount}</span>;
}

// Everything that is not "the next step" lives behind this, so the ticket
// carries one button and a mis-tap with wet hands lands on nothing
// destructive. Renders nothing when neither action applies.
function TicketMenu({
  number,
  disabled,
  onBump,
  onCancel,
}: {
  number: string | null;
  disabled: boolean;
  onBump?: () => void;
  onCancel?: () => void;
}) {
  if (!onBump && !onCancel) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 size-10 rounded-full text-muted-foreground"
          aria-label={`More actions for order #${number}`}
          disabled={disabled}
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {onBump && (
          <DropdownMenuItem onSelect={onBump} className="py-2.5">
            <Zap className="size-4" aria-hidden="true" />
            Bump to front
          </DropdownMenuItem>
        )}
        {onCancel && (
          <DropdownMenuItem
            onSelect={onCancel}
            className="py-2.5 text-destructive focus:text-destructive"
          >
            Cancel order
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Every customisation is on the ticket with nothing to open: whoever is making
// the order needs all of it, and a collapsed ticket cost a tap per order. They
// are kept short instead, as the vendor's own codes where set (see
// ticketOptions).
function TicketItems({
  items,
  optionCodes,
  showPrices,
}: {
  items: ReturnType<typeof parseOrderItems>;
  optionCodes?: OptionCodes;
  showPrices: boolean;
}) {
  return (
    <ul className="space-y-2.5 px-4 py-3.5">
      {items.map((item, i) => {
        const options = ticketOptions(item, optionCodes);
        return (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-base leading-snug font-medium break-words">
                <span className="font-mono font-bold">{item.quantity}×</span>{" "}
                {item.name}
              </p>
              {showPrices && (
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {item.price_cents == null
                    ? "Free"
                    : formatPrice(item.price_cents * item.quantity)}
                </span>
              )}
            </div>
            {options.length > 0 && (
              <p className="mt-0.5 flex flex-wrap pl-7 text-sm leading-snug font-medium text-foreground/80">
                {options.map((option, j) => (
                  <span
                    key={j}
                    className="break-words after:mx-1.5 after:text-muted-foreground/60 after:content-['·'] last:after:content-none"
                  >
                    {option}
                  </span>
                ))}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The foot of the ticket: at most one next step (or its undo), the payment
// check when money is outstanding, and the history list's date and total.
// Split out of OrderCard so each reads as one concern.
function TicketActions({
  order,
  status,
  payStatus,
  updating,
  amountDue,
  pendingUndo,
  undoMs,
  remainingAutoClearMs,
  showDate,
  onConfirmPayment,
  onConfirmPaymentAndStart,
  onAdvance,
  onUndo,
  onRestore,
}: {
  order: BoardOrder;
  status: OrderStatus;
  payStatus: PaymentStatus;
  updating: boolean;
  amountDue: string | null;
  pendingUndo: PendingUndo | null;
  undoMs: number;
  remainingAutoClearMs: number | null;
  showDate: boolean;
  onConfirmPayment: () => void;
  onConfirmPaymentAndStart: () => void;
  onAdvance: () => void;
  onUndo: () => void;
  onRestore: () => void;
}) {
  const [proofExpanded, setProofExpanded] = useState(false);
  const closed = isTerminal(status);
  const advance = ADVANCE[status];
  const paymentReviewNeeded = needsPaymentReview(status, payStatus);
  const priced = amountDue != null;

  return (
    <div className="mt-auto">
      {/* Tap-to-expand proof-photo review — only once a customer has
          actually claimed payment (a proof photo only exists then). Covers
          both payment-review button shapes below (the plain confirm button
          and the merged "Mark paid & start" one), since both require
          payStatus === "claimed". */}
      {status !== "cancelled" &&
        payStatus === "claimed" &&
        order.payment_proof_path && (
          <ProofPhotoTrigger
            order={order}
            expanded={proofExpanded}
            onToggle={() => setProofExpanded((v) => !v)}
          />
        )}

      {/* Completed unpaid orders retain settlement; cancelled orders never prompt for payment. */}
      {status !== "cancelled" &&
        status !== "pending" &&
        payStatus === "claimed" && (
          <div className="px-4 pb-3">
            <Button
              className={PAYMENT_BUTTON}
              onClick={onConfirmPayment}
              disabled={updating}
            >
              <Banknote className="size-5" /> Confirm payment received
              <AmountDue amount={amountDue} />
            </Button>
          </div>
        )}
      {status !== "cancelled" &&
        status !== "pending" &&
        payStatus === "pending" && (
          <div className="px-4 pb-3">
            <Button
              size="sm"
              className="h-10 w-full rounded-lg bg-status-payment-claimed font-semibold text-white hover:bg-status-payment-claimed/90"
              onClick={onConfirmPayment}
              disabled={updating}
            >
              Mark as paid
              <AmountDue amount={amountDue} />
            </Button>
          </div>
        )}

      {/* Reconciled "Mark paid & start" review action — see
          paymentReviewNeeded above. */}
      {!closed && paymentReviewNeeded && (
        <div className="px-4 pb-3">
          <Button
            className={PAYMENT_BUTTON}
            onClick={onConfirmPaymentAndStart}
            disabled={updating}
          >
            <Banknote className="size-5" /> Mark paid &amp; start
            <AmountDue amount={amountDue} />
          </Button>
        </div>
      )}

      {/* Stays visible through a pending undo window even once `closed`
          (e.g. a just-completed order) — otherwise the undo affordance
          itself would vanish along with the row. */}
      {(!closed || pendingUndo) &&
        (pendingUndo && status === pendingUndo.revertFrom ? (
          // Instant tap, no confirm gate on the advance itself — this is
          // the recovery path instead: a few seconds to catch a mis-tap,
          // draining left-to-right so the deadline is visible at a glance.
          <div className="px-4 pb-4">
            <Button
              type="button"
              variant="outline"
              className="relative h-12 w-full overflow-hidden rounded-lg text-base font-semibold"
              onClick={onUndo}
              disabled={updating}
            >
              <span
                className="undo-bar absolute inset-y-0 left-0 bg-foreground/10"
                style={{ animationDuration: `${undoMs}ms` }}
                aria-hidden="true"
              />
              <span className="relative flex items-center gap-1.5">
                <Undo2 className="size-4" /> Undo
              </span>
            </Button>
          </div>
        ) : (
          advance &&
          !paymentReviewNeeded && (
            <div className="px-4 pb-4">
              <Button
                className="relative h-12 w-full overflow-hidden rounded-lg text-base font-semibold"
                onClick={onAdvance}
                disabled={updating}
              >
                {remainingAutoClearMs != null && (
                  <span
                    className="autoclear-bar absolute inset-y-0 left-0 bg-black/10"
                    style={{
                      animationDuration: `${remainingAutoClearMs}ms`,
                    }}
                    aria-hidden="true"
                  />
                )}
                <span className="relative">{advance.label}</span>
              </Button>
            </div>
          )
        ))}

      {closed && !pendingUndo && order.auto_completed && (
        <div className="px-4 pb-4">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-lg text-base font-semibold"
            onClick={onRestore}
            disabled={updating}
          >
            <Undo2 className="size-4" /> Restore to ready
          </Button>
        </div>
      )}

      {showDate && (
        <div className="flex items-baseline justify-between border-t border-border/60 px-4 py-2.5 font-mono text-xs text-muted-foreground">
          <span>{shortDateTime(order.created_at)}</span>
          {priced && (
            <span className="text-sm font-bold text-foreground">
              {formatPrice(order.total_cents)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
