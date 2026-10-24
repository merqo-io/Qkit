"use server";

import { headers } from "next/headers";
// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseOrderRef } from "@/lib/schemas";
import { recordOrderStatusEvent } from "@/lib/audit";
import type { ActionResult } from "@/lib/action-result";

/**
 * Self-checkout pickup kiosk action: flips a `ready` order straight to
 * `completed`. Authorized purely by the scanned token — same trust level as
 * every other customer order action, see ../pickup/README.md. Distinguishes
 * "not ready yet" from "already collected" (a double-scan) from a genuinely
 * invalid booth/order/token so the kiosk can show the right message.
 */
export async function confirmCollection(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult<{ status: "completed" }>> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  const ip = clientIp(await headers());
  const allowed = await rateLimit(`collect:${boothId}:${ip}`, 20, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts -- wait a moment." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (!order) return { success: false, error: "Invalid order" };
  if (order.status === "completed")
    return { success: false, error: "Already collected." };
  if (order.status !== "ready")
    return { success: false, error: "Not ready yet." };

  // A customer can acknowledge pickup, but only the vendor can confirm money.
  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "ready")
    .select("id");
  if (error) {
    console.error("confirmCollection failed", error.message);
    return { success: false, error: "Could not complete order. Try again." };
  }
  if (!rows || rows.length === 0)
    return { success: false, error: "Order changed -- try scanning again." };

  await recordOrderStatusEvent({
    order_id: order.id,
    from_status: "ready",
    to_status: "completed",
    actor: null,
  });

  return { success: true, status: "completed" };
}
