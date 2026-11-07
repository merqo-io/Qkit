"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { boardSettingsSchema } from "@/lib/schemas";
import { ABANDONED_PAYMENT_MS } from "@/lib/orders";
import { recordOrderStatusEvent } from "@/lib/audit";

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
