"use server";

import { uuidSchema } from "@/lib/schemas";
import { isTerminal } from "@/lib/orders";
import { recordAudit, recordOrderStatusEvent } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { failWithIncident, loadOwnOrder } from "./order-action-helpers";

/**
 * Manually bump a live order to the front of its status lane — an explicit,
 * one-time vendor override (e.g. an elderly/non-digital customer at the
 * counter), not a permanent pin. Rejects a terminal order; no limit on how
 * often a live order can be re-bumped (deliberate — see
 * docs/superpowers/specs/2026-07-18-manual-queue-priority-override-design.md).
 */
export async function bumpOrder(orderId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(orderId).success) return fail("Invalid order");

  const { supabase, order } = await loadOwnOrder(orderId);
  if (!supabase || !order) return fail("Order not found");
  if (isTerminal(order.status)) return fail("Order is already closed");

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
    return failWithIncident("bumpOrder", orderId, "Failed to bump order");
  }
  if (!rows || rows.length === 0) return fail("Order changed. Please refresh.");

  return ok();
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
  if (!uuidSchema.safeParse(orderId).success) return fail("Invalid order");

  const { supabase, order, userId } = await loadOwnOrder(orderId);
  if (!supabase || !order) return fail("Order not found");
  const autoCompletedRace =
    order.status === "completed" && order.auto_completed;
  if (isTerminal(order.status) && !autoCompletedRace)
    return fail("Order is already closed");
  // No refund rail: cancelling a confirmed-payment order would take money with
  // no order behind it. A "claimed" order (customer says paid, unconfirmed)
  // stays cancellable — the money isn't real to us until the vendor confirms.
  if (order.payment_status === "confirmed")
    return fail(
      "Paid orders can't be cancelled. Refund the customer directly.",
    );

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
    return failWithIncident("cancelOrder", orderId, "Failed to cancel order");
  }
  if (!rows || rows.length === 0) return fail("Order changed. Please refresh.");

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

  return ok();
}
