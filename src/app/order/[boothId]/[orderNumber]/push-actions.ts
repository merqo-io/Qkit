"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { parseOrderRef } from "@/lib/schemas";
import { isTerminal } from "@/lib/orders";
import { resolveOrderDisplay } from "@/lib/order-display";
import { readyNotificationContent } from "@/lib/order-alerts";
import { pushSubscriptionSchema } from "@/lib/push/subscription";
import type { ActionResult } from "@/lib/action-result";

// One customer rarely has more than a phone and a laptop on one order; the cap
// keeps a scripted caller from piling rows onto an order it holds the token for.
const MAX_SUBSCRIPTIONS_PER_ORDER = 5;

const FAILED = "Could not turn on alerts.";

/**
 * Saves the customer's web push subscription so advanceOrder's ready
 * transition can reach a locked phone (src/lib/push/send.ts). The access
 * token is what authorizes it, as on every customer status action. The
 * notification text and link are computed here, never taken from the client.
 */
export async function savePushSubscription(
  boothId: string,
  orderNumber: string,
  token: string,
  subscription: unknown,
): Promise<ActionResult> {
  if (!parseOrderRef(boothId, orderNumber, token).ok)
    return { success: false, error: "Invalid order" };
  const sub = pushSubscriptionSchema.safeParse(subscription);
  if (!sub.success) return { success: false, error: FAILED };

  if (!(await rateLimit(`push-subscribe:${token}`, 10, 60)))
    return { success: false, error: "Too many attempts. Wait a moment." };

  const supabase = await createServiceClient();
  const [{ data: order }, { data: booth }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .eq("access_token", token)
      .maybeSingle(),
    supabase
      .from("booths")
      .select("name, vendor_id")
      .eq("id", boothId)
      .maybeSingle(),
  ]);
  if (!order || !booth) return { success: false, error: "Invalid order" };
  // Only an order still on its way to ready can use a ready alert.
  if (isTerminal(order.status) || order.status === "ready")
    return { success: false, error: FAILED };

  const { data: existing, error: existingError } = await supabase
    .from("order_push_subscriptions")
    .select("endpoint")
    .eq("order_id", order.id);
  if (existingError) return { success: false, error: FAILED };
  const known = (existing ?? []).some((r) => r.endpoint === sub.data.endpoint);
  if (!known && (existing ?? []).length >= MAX_SUBSCRIPTIONS_PER_ORDER)
    return { success: false, error: FAILED };

  const display = await resolveOrderDisplay(
    supabase,
    boothId,
    booth.vendor_id,
    orderNumber,
  );
  const { title, body, tag } = readyNotificationContent(booth.name, display);

  const { error } = await supabase.from("order_push_subscriptions").upsert(
    {
      order_id: order.id,
      endpoint: sub.data.endpoint,
      p256dh: sub.data.keys.p256dh,
      auth: sub.data.keys.auth,
      title,
      body,
      url: `/order/${boothId}/${orderNumber}?t=${token}`,
      tag,
    },
    { onConflict: "order_id,endpoint" },
  );
  if (error) {
    console.error("savePushSubscription failed", error.message);
    return { success: false, error: FAILED };
  }
  return { success: true };
}
