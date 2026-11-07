"use server";

import {
  orderStatusSchema,
  paymentStatusSchema,
  uuidSchema,
} from "@/lib/schemas";
import { ADVANCE, buildAdvancePatch } from "@/lib/orders";
import { notifyPrintkit } from "@/app/o/[code]/notify";
import { recordAudit, recordOrderStatusEvent } from "@/lib/audit";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import {
  failWithIncident,
  loadOwnOrder,
  notifyOrderReady,
} from "./order-action-helpers";
import type { StatusResult } from "./order-action-helpers";

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
    return failWithIncident("advanceOrder", orderId, "Failed to update order");
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
  if (adv.next === "preparing" && order.order_number)
    await notifyPrintkit(order.booth_id, order.order_number);

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
    return failWithIncident("revertOrderAdvance", orderId, "Failed to undo");
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
    return failWithIncident(
      "restoreAutoCompleted",
      orderId,
      "Failed to restore order",
    );
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
