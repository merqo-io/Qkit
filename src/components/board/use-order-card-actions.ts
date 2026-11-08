import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ADVANCE } from "@/lib/orders";
import {
  advanceOrder,
  revertOrderAdvance,
  restoreAutoCompleted,
} from "@/app/dashboard/order-advance-actions";
import {
  bumpOrder,
  cancelOrder as cancelOrderAction,
} from "@/app/dashboard/order-cancel-actions";
import {
  confirmOrderPayment,
  confirmPaymentAndStart,
  declinePaymentClaim,
  revertPaymentAndStart,
} from "@/app/dashboard/order-payment-actions";
import { useAsyncAction } from "@/hooks/use-async-action";
import type { BoardOrder, OrderStatus } from "@/lib/types";
import type { PendingUndo } from "./order-card-parts";
import { useUndoWindow } from "./use-undo-window";

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

type ActionResult<T> =
  | ({ success: true } & T)
  | { success: false; error: string };

function runToasting<T>(
  run: ReturnType<typeof useAsyncAction>["run"],
  call: Promise<ActionResult<T>>,
  onSuccess?: (res: { success: true } & T) => void,
) {
  return run(async () => {
    const res = await call;
    if (!res.success) toast.error(res.error);
    else onSuccess?.(res);
  });
}

// Failure is captured and rethrown after run() so the in-flight flag
// still gates the bump/advance buttons while the dialog, not run(),
// decides how the error is shown.
async function cancelOrderOrThrow(
  run: ReturnType<typeof useAsyncAction>["run"],
  orderId: string,
  onCancelled: () => void,
) {
  let failure: Error | null = null;
  await run(async () => {
    const res = await cancelOrderAction(orderId).catch(() => null);
    if (!res?.success) {
      failure = new Error(res?.error ?? "");
      return;
    }
    onCancelled();
  });
  if (failure) throw failure;
}

/**
 * The ticket's local state and every mutation it can make. All mutations go
 * through validated server actions (the order-*-actions.ts files); the DB
 * enforces ownership (RLS) and column integrity (a freeze trigger).
 */
export function useOrderCardActions({
  order,
  undoMs,
  onUndoWindowChange,
}: {
  order: BoardOrder;
  undoMs: number;
  onUndoWindowChange?: (orderId: string, active: boolean) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  // Resync to the (realtime-updated) prop when it actually changes value, so a
  // remote status change (another device advancing/cancelling) reflects on the
  // card. An optimistic local setStatus doesn't change the prop, so it survives
  // until its own realtime echo arrives and this no-ops.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local state to the prop until its realtime echo arrives
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
  const bumped =
    bumpedLocally ||
    (order.priority_bumped_at !== null &&
      order.priority_bumped_at !== undefined);
  const { pending: updating, run } = useAsyncAction();

  const { pendingUndo, setPendingUndo, openUndoWindow, stopTimer } =
    useUndoWindow(order.id, undoMs, onUndoWindowChange);

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
        openUndoWindow({
          revertTo,
          revertFrom: res.status,
          prevPaymentStatus,
          action: "advance",
        });
      }
    });
  }

  function undoAdvance() {
    if (!pendingUndo) return;
    const pending = pendingUndo;
    const orderId = order.id;
    stopTimer();
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
    return runToasting(run, confirmOrderPayment(order.id), () =>
      setConfirmedLocally(true),
    );
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
        openUndoWindow({
          revertTo: "pending",
          revertFrom: res.status,
          prevPaymentStatus: res.prevPaymentStatus,
          action: "paymentAndStart",
        });
      }
    });
  }

  // The customer's claim goes back to unpaid; the order itself is untouched,
  // so they can pay again. The payment status prop follows via realtime.
  function declinePayment() {
    return runToasting(run, declinePaymentClaim(order.id));
  }

  function bump() {
    return runToasting(run, bumpOrder(order.id), () => setBumpedLocally(true));
  }

  function restoreToReady() {
    return runToasting(run, restoreAutoCompleted(order.id), (res) =>
      setStatus(res.status),
    );
  }

  const cancel = () =>
    cancelOrderOrThrow(run, order.id, () => setStatus("cancelled"));

  return {
    status,
    payStatus,
    bumped,
    updating,
    pendingUndo,
    advanceStatus,
    undoAdvance,
    confirmPayment,
    confirmPaymentAndStart: confirmPaymentAndStartHandler,
    declinePayment,
    bump,
    restoreToReady,
    cancel,
  };
}
