"use server";

import { after } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import {
  boardSettingsSchema,
  orderStatusSchema,
  paymentStatusSchema,
  uuidSchema,
} from "@/lib/schemas";
import {
  ABANDONED_PAYMENT_MS,
  ADVANCE,
  buildAdvancePatch,
  isTerminal,
  paymentDeadline,
} from "@/lib/orders";
import { confirmCheckout, unclaimCheckout } from "@/lib/paykit/client";
import { transactionIdForOrder } from "@/lib/paykit/transaction-for-order";
import { notifyCustomer } from "@/lib/merqo/customer-notify";
import { sendOrderReadyPush } from "@/lib/push/send";
import { recordAudit, recordOrderStatusEvent } from "@/lib/audit";
import type { ActionResult } from "@/lib/action-result";
import type { OrderStatus, PaymentStatus } from "@/lib/types";

// Vendor order-board mutations behind a validated server boundary. Authorization
// is enforced in Postgres: getUser() gates signed-in, and RLS
// (orders_vendor_update USING + WITH CHECK) scopes writes to the vendor's own
// booths — the server client runs as the AUTHENTICATED role, never service-role.
// The 0032 freeze trigger blocks any attempt to change financial/identity
// columns, so these actions only ever touch the state-machine columns.
//
// Every actual order.status transition below is also recorded to
// qkit.order_status_events (migration 0078, append-only) via
// recordOrderStatusEvent, and a short qkit.admin_audit entry (migration 0006,
// reused for vendor-initiated actions too — see src/lib/audit.ts) is
// recorded for the vendor-facing actions worth being able to reconstruct or
// dispute later. Both are best-effort/non-blocking: a write failure there is
// only logged, never surfaced to the caller.

type StatusResult = ActionResult<{ status: OrderStatus }>;

/** Load the current order (RLS-scoped to the caller's booths) for a gated vendor. */
async function loadOwnOrder(orderId: string) {
  const user = await getUser();
  if (!user) return { supabase: null, order: null, userId: null } as const;

  const supabase = await createServerClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, auto_completed, total_cents, created_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  // A read error (not a missing row) is otherwise indistinguishable from
  // "not found" to the caller — log it so a DB hiccup is debuggable.
  if (error) console.error("loadOwnOrder failed", error.message);
  return { supabase, order, userId: user.id } as const;
}

/**
 * Vendor-side gate on the `ready`-transition customer Telegram ping — a
 * brand-preference switch, not a consent gate (the customer's own consent,
 * given once via merqo's connect flow, is untouched by this). Fails open:
 * an unparseable/missing board_settings row (every vendor whose row predates
 * this key, i.e. everyone at ship time) reads as "not explicitly disabled",
 * same default-true rationale as boardSettingsSchema's own `.default(true)`.
 * Only an explicit `customer_telegram_notify_enabled: false` suppresses it.
 */
async function customerNotifyEnabled(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  vendorId: string,
): Promise<boolean> {
  const { data: vendor } = await supabase
    .from("vendors")
    .select("board_settings")
    .eq("id", vendorId)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  return !(
    settings.success && settings.data.customer_telegram_notify_enabled === false
  );
}

/**
 * The customer alerts for a fresh `ready`: web push and the Telegram ping.
 * Neither may change advanceOrder's result, so every failure stays in here.
 */
async function notifyOrderReady(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  orderId: string,
  userId: string | null,
): Promise<void> {
  // Web push to a customer who asked for an alert, sent after the response so
  // Mark Ready (and "Mark all ready") is never slowed by the push services.
  // Not gated by the vendor's Telegram switch: the customer opted in from
  // their own browser, as with the page's own popup.
  try {
    after(() => sendOrderReadyPush(orderId));
  } catch (err) {
    console.error("advanceOrder: scheduling web push failed", err);
  }

  // Same fire-and-forget pattern as notifyVendorTelegram in
  // src/app/o/[code]/notify.ts: notifyCustomer already never throws on its
  // own, but this call site still wraps it so nothing here can ever change
  // advanceOrder's own returned result.
  if (!userId) return;
  try {
    if (!(await customerNotifyEnabled(supabase, userId))) return;
    await notifyCustomer(
      userId,
      `qkit:${orderId}`,
      "Your order is ready for pickup!",
    );
  } catch (err) {
    console.error("advanceOrder: notifyCustomer failed", err);
  }
}

/**
 * Advance an order to its next state (preparing→ready→completed), stamping the
 * transition timestamp. The next state is derived server-side from the order's
 * current status — the client never dictates it. Rejects an order with no legal
 * forward move (e.g. already terminal).
 */
export async function advanceOrder(
  orderId: string,
  expectedStatus?: OrderStatus,
): Promise<StatusResult> {
  if (
    !uuidSchema.safeParse(orderId).success ||
    (expectedStatus !== undefined &&
      !orderStatusSchema.safeParse(expectedStatus).success)
  )
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };

  // A stale Mark Ready tap must never complete an order another device made ready.
  if (expectedStatus !== undefined && order.status !== expectedStatus)
    return { success: false, error: "Order changed. Please refresh." };

  const adv = ADVANCE[order.status];
  if (!adv) return { success: false, error: "Order can't be advanced" };

  // Guard on the status we read: if a concurrent action (e.g. a cancel) moved
  // the order meanwhile, the UPDATE matches 0 rows instead of blindly advancing
  // by id — which could otherwise resurrect a cancelled order into revenue+stock.
  const { data: rows, error } = await supabase
    .from("orders")
    .update(buildAdvancePatch(adv.next, new Date().toISOString()))
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("advanceOrder failed", error.message);
    return { success: false, error: "Failed to update order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed. Please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: order.status,
      to_status: adv.next,
      actor: userId,
    });
    await recordAudit({
      admin_id: userId,
      action: "advance_order_status",
      target_id: orderId,
      detail: { from: order.status, to: adv.next },
    });
  }

  if (adv.next === "ready") await notifyOrderReady(supabase, orderId, userId);

  return { success: true, status: adv.next };
}

/**
 * Undo a just-made advanceOrder call within its short undo window (see
 * order-card.tsx). `revertFrom` must be the legal ADVANCE target of
 * `revertTo` — the client can't use this to jump an order to an arbitrary
 * status, only to walk back the single transition it just made.
 * Payment confirmation is independent and is never undone by this action.
 */
export async function revertOrderAdvance(
  orderId: string,
  revertTo: OrderStatus,
  revertFrom: OrderStatus,
  prevPaymentStatus: PaymentStatus,
): Promise<StatusResult> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };
  if (
    !orderStatusSchema.safeParse(revertTo).success ||
    !orderStatusSchema.safeParse(revertFrom).success ||
    !paymentStatusSchema.safeParse(prevPaymentStatus).success
  )
    return { success: false, error: "Not a valid undo" };
  if (ADVANCE[revertTo]?.next !== revertFrom)
    return { success: false, error: "Not a valid undo" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };

  const patch: {
    status: OrderStatus;
    ready_at?: null;
    completed_at?: null;
  } = { status: revertTo };
  if (revertFrom === "ready") patch.ready_at = null;
  if (revertFrom === "completed") {
    patch.completed_at = null;
  }

  // Guard on the status we read: if something else moved the order during
  // the undo window (e.g. another device advanced it further), this becomes
  // a no-op refresh prompt instead of clobbering that concurrent change.
  const { data: rows, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("status", revertFrom)
    .select("id");
  if (error) {
    console.error("revertOrderAdvance failed", error.message);
    return { success: false, error: "Failed to undo" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed. Please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: revertFrom,
      to_status: revertTo,
      actor: userId,
    });
    await recordAudit({
      admin_id: userId,
      action: "revert_order_advance",
      target_id: orderId,
      detail: { from: revertFrom, to: revertTo },
    });
  }

  return { success: true, status: revertTo };
}

/**
 * Reconciled "Mark paid & start" review action: there's no real scenario
 * where a vendor confirms payment on a still-pending order without also
 * starting it, so this does both in one write instead of two separate taps.
 * Rejects an order that isn't pending, or whose payment is already settled
 * (confirmed/not_required) — those cases keep using the plain advance button.
 * Confirms via paykit first, same as confirmOrderPayment, so a customer claim
 * transaction doesn't stay stuck at "claimed" on paykit's side.
 */
export async function confirmPaymentAndStart(
  orderId: string,
): Promise<
  ActionResult<{ status: OrderStatus; prevPaymentStatus: PaymentStatus }>
> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId)
    return { success: false, error: "Order not found" };

  if (
    order.status !== "pending" ||
    order.payment_status === "confirmed" ||
    order.payment_status === "not_required"
  )
    return { success: false, error: "Order can't be advanced" };

  const prevPaymentStatus = order.payment_status;

  const transaction = await transactionIdForOrder({
    vendorId: userId,
    amountCents: order.total_cents,
    orderRef: order.id,
    expiresAt: paymentDeadline(order.created_at),
  });
  if (!transaction.ok) {
    console.error(
      "confirmPaymentAndStart: paykit transaction lookup failed",
      transaction.error,
    );
    return { success: false, error: "Failed to confirm payment" };
  }
  const confirm = await confirmCheckout(transaction.data);
  if (!confirm.ok) {
    console.error(
      "confirmPaymentAndStart: paykit confirm failed",
      confirm.error,
    );
    return { success: false, error: "Failed to confirm payment" };
  }
  if (confirm.data.status !== "confirmed")
    return { success: false, error: "Failed to confirm payment" };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "preparing", payment_status: "confirmed" })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("confirmPaymentAndStart failed", error.message);
    return { success: false, error: "Failed to update order" };
  }
  if (!rows || rows.length === 0) {
    // paykit's confirm above already happened for real -- a lost race here
    // doesn't necessarily mean it's safe to report success (the concurrent
    // change could just as well be a cancel), so re-read rather than assume
    // either way. Only a concurrent call that already reached the same
    // confirmed+advanced state counts as "already done"; anything else
    // (still pending, or cancelled) is a genuine conflict.
    const { data: current } = await supabase
      .from("orders")
      .select("status, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (
      current &&
      current.status !== "pending" &&
      current.status !== "cancelled" &&
      current.payment_status === "confirmed"
    ) {
      return { success: true, status: current.status, prevPaymentStatus };
    }
    return { success: false, error: "Order changed -- please refresh." };
  }

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: "pending",
      to_status: "preparing",
      actor: userId,
    });
    await recordAudit({
      admin_id: userId,
      action: "confirm_payment_and_start",
      target_id: orderId,
      detail: { prevPaymentStatus },
    });
  }

  return { success: true, status: "preparing", prevPaymentStatus };
}

/**
 * Undo a just-made confirmPaymentAndStart call within its short undo window —
 * but only the "start" half. Unlike revertOrderAdvance's own undo,
 * payment_status is deliberately left alone: confirmPaymentAndStart's
 * paykit confirm already happened for real and paykit has no "unconfirm"
 * capability, so reverting the local mirror back to pending/claimed would
 * make qkit lie about money paykit still shows as confirmed — same
 * no-refund-rail principle cancelOrder already applies to a confirmed
 * payment. `prevPaymentStatus` is kept only so this shares a call
 * signature with revertOrderAdvance at the one dispatch site (order-card.tsx).
 */
export async function revertPaymentAndStart(
  orderId: string,
  _prevPaymentStatus: PaymentStatus,
): Promise<ActionResult<{ status: OrderStatus }>> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, userId } = await loadOwnOrder(orderId);
  if (!supabase) return { success: false, error: "Order not found" };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "pending" })
    .eq("id", orderId)
    .eq("status", "preparing")
    .select("id");
  if (error) {
    console.error("revertPaymentAndStart failed", error.message);
    return { success: false, error: "Failed to revert order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed -- please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: "preparing",
      to_status: "pending",
      actor: userId,
    });
  }

  return { success: true, status: "pending" };
}

/**
 * Restore an order the auto-clear sweep completed prematurely back to
 * 'ready'. Deliberately narrower than revertOrderAdvance — this is a fresh
 * page load with no client-held prior state (the completed-orders history
 * page, not the live board's short undo window) — and only ever applies to
 * a sweep-driven completion (auto_completed=true), never a vendor's own
 * manual "Mark Picked Up" tap. Restamps ready_at to now — without this, the
 * restored order still carries its original (pre-sweep) ready_at and the
 * very next sweepReadyOrders poll would immediately re-complete it, making
 * the restore a no-op in practice.
 */
export async function restoreAutoCompleted(
  orderId: string,
): Promise<StatusResult> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  if (order.status !== "completed" || !order.auto_completed)
    return { success: false, error: "This order can't be restored" };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({
      status: "ready",
      ready_at: new Date().toISOString(),
      completed_at: null,
      auto_completed: false,
    })
    .eq("id", orderId)
    .eq("status", "completed")
    .select("id");
  if (error) {
    console.error("restoreAutoCompleted failed", error.message);
    return { success: false, error: "Failed to restore order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed. Please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: "completed",
      to_status: "ready",
      actor: userId,
    });
    await recordAudit({
      admin_id: userId,
      action: "restore_completed_order",
      target_id: orderId,
      detail: { from: "completed", to: "ready" },
    });
  }

  return { success: true, status: "ready" };
}

/**
 * Mark a claimed/pending order as paid. Idempotent if already confirmed;
 * rejects orders that never needed payment.
 *
 * paykit is now the source of truth for the confirm transition itself — the
 * vendor IS the `vendor_id` paykit's config/checkout are keyed on, so no extra
 * booth lookup is needed. RLS does not by itself confine this action to the
 * vendor's own orders: an admin account can read every order
 * (`orders_admin_select`), so transactionIdForOrder refuses a transaction that
 * belongs to a different vendor. `orderId` is reused as paykit's `order_ref`,
 * matching the checkout paykit already created for this order on the
 * customer's pay page. The transaction is
 * looked up by that reference (see transactionIdForOrder) rather than
 * re-created, so this still works after the vendor edits payment details.
 * `orders.payment_status` is then updated as a local mirror, same rationale
 * as the customer's claim: the rest of qkit's order-lifecycle
 * logic (cancel-blocking, payment displays, board realtime) still
 * reads it directly.
 */
export async function confirmOrderPayment(
  orderId: string,
): Promise<ActionResult> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId)
    return { success: false, error: "Order not found" };

  if (order.payment_status === "confirmed") return { success: true };
  if (order.payment_status === "not_required")
    return { success: false, error: "This order doesn't take payment" };
  if (order.status === "cancelled")
    return { success: false, error: "This order was cancelled" };

  const transaction = await transactionIdForOrder({
    vendorId: userId,
    amountCents: order.total_cents,
    orderRef: order.id,
    expiresAt: paymentDeadline(order.created_at),
  });
  if (!transaction.ok) {
    console.error(
      "confirmOrderPayment: paykit transaction lookup failed",
      transaction.error,
    );
    return { success: false, error: "Failed to confirm payment" };
  }
  const confirm = await confirmCheckout(transaction.data);
  if (!confirm.ok) {
    console.error("confirmOrderPayment: paykit confirm failed", confirm.error);
    return { success: false, error: "Failed to confirm payment" };
  }
  if (confirm.data.status !== "confirmed")
    return { success: false, error: "Failed to confirm payment" };

  // Guard on the payment_status we read so a concurrent flip (double-tap, or a
  // cancel) makes this a no-op rather than a lost update. paykit already
  // recorded the confirm by this point, so a lost race here (0 rows) doesn't
  // change the outcome the customer sees via the paykit-backed source of truth.
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "confirmed", paid_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("payment_status", order.payment_status)
    .select("id");
  if (error)
    console.error(
      "confirmOrderPayment: local mirror update failed",
      error.message,
    );

  // Covers both the QR and walk-up paths — a walk-up order taken unpaid at
  // the counter and settled later goes through this same confirm action.
  await recordAudit({
    admin_id: userId,
    action: "confirm_order_payment",
    target_id: orderId,
    detail: { from: order.payment_status, amount_cents: order.total_cents },
  });

  return { success: true };
}

/**
 * Vendor rejects a customer's "I've paid" claim (the payment proof modal's
 * Decline). The claim goes back to unpaid in paykit, the same revert the
 * customer's own "Tapped by mistake? Undo" uses, so the customer can pay again
 * and the order stays on the board. Never touches a confirmed payment:
 * paykit echoes `confirmed` unchanged and this reports it rather than
 * mirroring a revert that did not happen.
 */
export async function declinePaymentClaim(
  orderId: string,
): Promise<ActionResult> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId)
    return { success: false, error: "Order not found" };

  if (order.payment_status === "pending") return { success: true };
  if (order.payment_status !== "claimed")
    return { success: false, error: "No payment claim to decline" };
  if (order.status === "cancelled")
    return { success: false, error: "This order was cancelled" };

  const transaction = await transactionIdForOrder({
    vendorId: userId,
    amountCents: order.total_cents,
    orderRef: order.id,
    expiresAt: paymentDeadline(order.created_at),
  });
  if (!transaction.ok) {
    console.error(
      "declinePaymentClaim: paykit transaction lookup failed",
      transaction.error,
    );
    return { success: false, error: "Failed to decline payment" };
  }
  const unclaim = await unclaimCheckout(transaction.data);
  if (!unclaim.ok) {
    console.error("declinePaymentClaim: paykit unclaim failed", unclaim.error);
    return { success: false, error: "Failed to decline payment" };
  }
  if (unclaim.data.status === "confirmed")
    return { success: false, error: "This payment was already confirmed" };
  if (unclaim.data.status !== "pending")
    return { success: false, error: "Failed to decline payment" };

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "pending" })
    .eq("id", orderId)
    .eq("payment_status", "claimed")
    .select("id");
  if (error)
    console.error(
      "declinePaymentClaim: local mirror update failed",
      error.message,
    );

  await recordAudit({
    admin_id: userId,
    action: "decline_order_payment",
    target_id: orderId,
    detail: { from: "claimed", amount_cents: order.total_cents },
  });

  return { success: true };
}

/**
 * Manually bump a live order to the front of its status lane — an explicit,
 * one-time vendor override (e.g. an elderly/non-digital customer at the
 * counter), not a permanent pin. Rejects a terminal order; no limit on how
 * often a live order can be re-bumped (deliberate — see
 * docs/superpowers/specs/2026-07-18-manual-queue-priority-override-design.md).
 */
export async function bumpOrder(orderId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  if (isTerminal(order.status))
    return { success: false, error: "Order is already closed" };

  // Guard on the status we read, same concurrency pattern as advance/cancel —
  // a status change between the read and this write means someone else acted
  // on the order first, so this bump becomes a no-op refresh prompt rather
  // than silently bumping a now-stale view of the order.
  const { data: rows, error } = await supabase
    .from("orders")
    .update({ priority_bumped_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("bumpOrder failed", error.message);
    return { success: false, error: "Failed to bump order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed. Please refresh." };

  return { success: true };
}

/**
 * Cancel a live order. Rejects an order that's already completed/cancelled --
 * except an auto-completed one (sweepReadyOrders beat the vendor to it, not a
 * deliberate "Mark Picked Up" tap): that's still cancellable, same philosophy
 * as restoreAutoCompleted treating the sweep's own completion as reversible.
 * Clears auto_completed/completed_at on that path so a cancelled order never
 * carries stale "this was completed" bookkeeping.
 */
export async function cancelOrder(orderId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(orderId).success)
    return { success: false, error: "Invalid order" };

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return { success: false, error: "Order not found" };
  const autoCompletedRace =
    order.status === "completed" && order.auto_completed;
  if (isTerminal(order.status) && !autoCompletedRace)
    return { success: false, error: "Order is already closed" };
  // No refund rail: cancelling a confirmed-payment order would take money with
  // no order behind it. A "claimed" order (customer says paid, unconfirmed)
  // stays cancellable — the money isn't real to us until the vendor confirms.
  if (order.payment_status === "confirmed")
    return {
      success: false,
      error: "Paid orders can't be cancelled. Refund the customer directly.",
    };

  // Guard on the status we read so a cancel can't race an advance to completed
  // (which would otherwise be undone, or leave stock/revenue inconsistent) --
  // an auto-completed order is the one deliberate exception (see above).
  const { data: rows, error } = await supabase
    .from("orders")
    .update(
      autoCompletedRace
        ? { status: "cancelled", auto_completed: false, completed_at: null }
        : { status: "cancelled" },
    )
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("cancelOrder failed", error.message);
    return { success: false, error: "Failed to cancel order" };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed. Please refresh." };

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: order.status,
      to_status: "cancelled",
      actor: userId,
    });
    await recordAudit({
      admin_id: userId,
      action: "cancel_order",
      target_id: orderId,
      detail: { from: order.status },
    });
  }

  return { success: true };
}

/**
 * Auto-clear sweep: flips every 'ready' order older than the vendor's
 * configured ready_auto_clear_min (board_settings) to 'completed'. No id
 * param — bulk, RLS-scoped to the caller's own booths (orders_vendor_update)
 * exactly like every other mutation here. Called on a client poll (see
 * realtime-order-board.tsx), so an open board clears them promptly;
 * qkit.sweep_stale_orders (migration 0097) does the same on a schedule for
 * when no board is open. Returns void: this is a background
 * sweep the caller doesn't surface a toast for — a real failure is logged,
 * and the next poll simply retries.
 */
export async function sweepReadyOrders(): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const supabase = await createServerClient();
  const { data: vendor } = await supabase
    .from("vendors")
    .select("board_settings")
    .eq("id", user.id)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  const minutes = settings.success ? settings.data.ready_auto_clear_min : null;
  if (minutes === null) return;

  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data: swept, error } = await supabase
    .from("orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      auto_completed: true,
    })
    .eq("status", "ready")
    .lt("ready_at", cutoff)
    .select("id");
  if (error) {
    console.error("sweepReadyOrders failed", error.message);
    return;
  }

  // Log the same real column transition each swept order just got, one
  // order_status_events row per order — no admin_audit entry here (this is
  // an automatic sweep, not a deliberate vendor decision, matching the
  // no-toast/logged-only failure handling this function already uses).
  for (const { id } of swept ?? []) {
    await recordOrderStatusEvent({
      order_id: id,
      from_status: "ready",
      to_status: "completed",
      actor: user.id,
    });
  }
}

/**
 * Abandoned-payment sweep: cancels every pending QR order older than 30
 * minutes. No vendor setting gate — this is baseline hygiene, not an opt-in
 * preference. No id param — bulk, RLS-scoped to the caller's own booths
 * (orders_vendor_update) exactly like every other mutation here. Called on a
 * client poll (realtime-order-board.tsx), so an open board clears them
 * promptly; qkit.sweep_stale_orders (migration 0097) does the same on a
 * schedule for when no board is open. Returns void: this is a
 * background sweep the caller doesn't surface a toast for — a real failure is
 * logged, and the next poll simply retries.
 */
export async function sweepAbandonedPayments(): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const supabase = await createServerClient();
  const cutoff = new Date(Date.now() - ABANDONED_PAYMENT_MS).toISOString();

  const { data: swept, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("payment_status", "pending")
    .eq("source", "qr")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    console.error("sweepAbandonedPayments failed", error.message);
    return;
  }

  // Log the same real column transition each swept order just got, one
  // order_status_events row per order — no admin_audit entry here (this is
  // an automatic sweep, not a deliberate vendor decision, matching the
  // no-toast/logged-only failure handling this function already uses).
  for (const { id } of swept ?? []) {
    await recordOrderStatusEvent({
      order_id: id,
      from_status: "pending",
      to_status: "cancelled",
      actor: user.id,
    });
  }
}
