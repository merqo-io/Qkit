import { after } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { boardSettingsSchema } from "@/lib/schemas";
import { notifyCustomer } from "@/lib/merqo/customer-notify";
import { sendOrderReadyPush } from "@/lib/push/send";
import { orderHasCounterOpsForAction } from "@/lib/counter-ops";
import { recordOrderIncident } from "@/lib/ops-events";
import type { ActionResult } from "@/lib/action-result";
import type { OrderStatus } from "@/lib/types";

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

export type StatusResult = ActionResult<{ status: OrderStatus }>;

/** A generic failure the vendor cannot act on, logged to ops_events for Merqo support. */
export async function failWithIncident(
  action: string,
  orderId: string,
  error: string,
): Promise<{ success: false; error: string }> {
  await recordOrderIncident("action_error", orderId, action);
  return { success: false, error };
}

/** Load the current order (RLS-scoped to the caller's booths) for a gated vendor. */
export async function loadOwnOrder(orderId: string) {
  const user = await getUser();
  if (!user) return { supabase: null, order: null, userId: null } as const;

  const supabase = await createServerClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, booth_id, order_number, status, payment_status, auto_completed, total_cents, created_at",
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
export async function notifyOrderReady(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  orderId: string,
  userId: string | null,
): Promise<void> {
  // Web push to a customer who asked for an alert, sent after the response so
  // Mark Ready (and "Mark all ready") is never slowed by the push services.
  // Not gated by the vendor's Telegram switch: the customer opted in from
  // their own browser, as with the page's own popup.
  try {
    after(async () => {
      // Order-ready push is a counter-ops feature; skipped silently otherwise.
      if (await orderHasCounterOpsForAction(orderId))
        await sendOrderReadyPush(orderId);
    });
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
