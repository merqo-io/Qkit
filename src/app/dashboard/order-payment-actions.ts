"use server";

import { uuidSchema } from "@/lib/schemas";
import { paymentDeadline } from "@/lib/orders";
import { confirmCheckout, unclaimCheckout } from "@/lib/paykit/client";
import { transactionIdForOrder } from "@/lib/paykit/transaction-for-order";
import { notifyPrintkit } from "@/app/o/[code]/notify";
import { recordAudit, recordOrderStatusEvent } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import { failWithIncident, loadOwnOrder } from "./order-action-helpers";

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
  if (!uuidSchema.safeParse(orderId).success) return fail("Invalid order");

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId) return fail("Order not found");

  if (
    order.status !== "pending" ||
    order.payment_status === "confirmed" ||
    order.payment_status === "not_required"
  )
    return fail("Order can't be advanced");

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
    return failWithIncident(
      "confirmPaymentAndStart",
      orderId,
      "Failed to confirm payment",
    );
  }
  const confirm = await confirmCheckout(transaction.data);
  if (!confirm.ok) {
    console.error(
      "confirmPaymentAndStart: paykit confirm failed",
      confirm.error,
    );
    return failWithIncident(
      "confirmPaymentAndStart",
      orderId,
      "Failed to confirm payment",
    );
  }
  if (confirm.data.status !== "confirmed")
    return failWithIncident(
      "confirmPaymentAndStart",
      orderId,
      "Failed to confirm payment",
    );

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "preparing", payment_status: "confirmed" })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id");
  if (error) {
    console.error("confirmPaymentAndStart failed", error.message);
    return failWithIncident(
      "confirmPaymentAndStart",
      orderId,
      "Failed to update order",
    );
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
      if (order.order_number)
        await notifyPrintkit(order.booth_id, order.order_number);
      return ok({ status: current.status, prevPaymentStatus });
    }
    return fail("Order changed -- please refresh.");
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

  if (order.order_number)
    await notifyPrintkit(order.booth_id, order.order_number);
  return ok({ status: "preparing", prevPaymentStatus });
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
  if (!uuidSchema.safeParse(orderId).success) return fail("Invalid order");

  const { supabase, userId } = await loadOwnOrder(orderId);
  if (!supabase) return fail("Order not found");

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "pending" })
    .eq("id", orderId)
    .eq("status", "preparing")
    .select("id");
  if (error) {
    console.error("revertPaymentAndStart failed", error.message);
    return failWithIncident(
      "revertPaymentAndStart",
      orderId,
      "Failed to revert order",
    );
  }
  if (!rows || rows.length === 0)
    return fail("Order changed -- please refresh.");

  if (userId) {
    await recordOrderStatusEvent({
      order_id: orderId,
      from_status: "preparing",
      to_status: "pending",
      actor: userId,
    });
  }

  return ok({ status: "pending" });
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
  if (!uuidSchema.safeParse(orderId).success) return fail("Invalid order");

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId) return fail("Order not found");

  if (order.payment_status === "confirmed") {
    if (order.order_number)
      await notifyPrintkit(order.booth_id, order.order_number);
    return ok();
  }
  if (order.payment_status === "not_required")
    return fail("This order doesn't take payment");
  if (order.status === "cancelled") return fail("This order was cancelled");

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
    return failWithIncident(
      "confirmOrderPayment",
      orderId,
      "Failed to confirm payment",
    );
  }
  const confirm = await confirmCheckout(transaction.data);
  if (!confirm.ok) {
    console.error("confirmOrderPayment: paykit confirm failed", confirm.error);
    return failWithIncident(
      "confirmOrderPayment",
      orderId,
      "Failed to confirm payment",
    );
  }
  if (confirm.data.status !== "confirmed")
    return failWithIncident(
      "confirmOrderPayment",
      orderId,
      "Failed to confirm payment",
    );

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

  if (order.order_number)
    await notifyPrintkit(order.booth_id, order.order_number);

  // Covers both the QR and walk-up paths — a walk-up order taken unpaid at
  // the counter and settled later goes through this same confirm action.
  await recordAudit({
    admin_id: userId,
    action: "confirm_order_payment",
    target_id: orderId,
    detail: { from: order.payment_status, amount_cents: order.total_cents },
  });

  return ok();
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
  if (!uuidSchema.safeParse(orderId).success) return fail("Invalid order");

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order || !userId) return fail("Order not found");

  if (order.payment_status === "pending") return ok();
  if (order.payment_status !== "claimed")
    return fail("No payment claim to decline");
  if (order.status === "cancelled") return fail("This order was cancelled");

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
    return failWithIncident(
      "declinePaymentClaim",
      orderId,
      "Failed to decline payment",
    );
  }
  const unclaim = await unclaimCheckout(transaction.data);
  if (!unclaim.ok) {
    console.error("declinePaymentClaim: paykit unclaim failed", unclaim.error);
    return failWithIncident(
      "declinePaymentClaim",
      orderId,
      "Failed to decline payment",
    );
  }
  if (unclaim.data.status === "confirmed")
    return fail("This payment was already confirmed");
  if (unclaim.data.status !== "pending")
    return failWithIncident(
      "declinePaymentClaim",
      orderId,
      "Failed to decline payment",
    );

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

  return ok();
}
