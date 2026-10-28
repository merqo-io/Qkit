"use server";

import { headers } from "next/headers";
// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { boardSettingsSchema, parseOrderRef } from "@/lib/schemas";
import { ordersAheadOf } from "@/lib/orders";
import { estimateWaitSeconds, type StatsOrder } from "@/lib/stats";
import { readKeysetRows } from "@/lib/supabase/read-keyset";
import type { ActionResult } from "@/lib/action-result";
import type { OrderStatus } from "@/lib/types";

// Active (non-terminal) statuses that occupy a spot in the live queue.
const ACTIVE_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
];

// How many of the booth's most recent completed orders feed the rolling
// wait-time average — see docs/superpowers/specs/2026-07-18-live-wait-time-
// estimate-design.md for why a recent window, not the full history.
const RECENT_ORDER_LIMIT = 20;

/**
 * Read the current status of one order. Polling fallback for the live status
 * page: Supabase realtime (WebSocket) is unreliable on Safari/iOS, so the
 * client also polls this every few seconds. Service client bypasses RLS —
 * customers are unauthenticated — and only the single status field leaks.
 */
export async function getOrderStatus(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<OrderStatus | null> {
  if (!parseOrderRef(boothId, orderNumber, token).ok) return null;

  const supabase = await createServiceClient();

  // The token itself can't be brute-forced (122-bit random), but whoever
  // already holds one could script polling far faster than the page's own
  // 5s cadence to amplify DB load — cap well above normal single-tab usage.
  const allowed = await rateLimit(`order-status:${token}`, 30, 60);
  if (!allowed) return null;

  // maybeSingle (not single): a not-yet-readable / unknown order is a normal
  // null, not an error — only real DB/network failures should surface in logs.
  // The token match is what authorizes the read (booth_id + number aren't secret).
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (error) console.error("getOrderStatus failed", error.message);

  return data?.status ?? null;
}

/**
 * Customer-triggered arrival confirmation: flips a booth-gated order from
 * 'pending' to 'confirmed' when printing is enabled, leaving vendor Start
 * as the preparation trigger. Other booths still move to 'preparing'. Token-gated and rate-limited exactly like unclaimPayment
 * (payment-actions.ts) — both are unauthenticated, customer-initiated state
 * flips on the same order row.
 */
export async function confirmArrival(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<ActionResult> {
  const parsed = parseOrderRef(boothId, orderNumber, token);
  if (!parsed.ok)
    return {
      success: false,
      error: parsed.field === "booth" ? "Invalid booth" : "Invalid order",
    };

  const supabase = await createServiceClient();

  // Throttle per IP+booth for the same reason as unclaimPayment's guard — small
  // sequential order numbers are easy to enumerate.
  const ip = clientIp(await headers());
  const allowed = await rateLimit(`arrival:${boothId}:${ip}`, 10, 60);
  if (!allowed)
    return { success: false, error: "Too many attempts. Wait a moment." };

  // A booth can also land an order in 'pending' because it has no printer
  // connected (0086) — that's a vendor-accept gate, not an arrival gate, and
  // must not be self-servable by the customer.
  const { data: booth } = await supabase
    .from("booths")
    .select("requires_arrival_confirm, print_enabled")
    .eq("id", boothId)
    .maybeSingle();
  if (!booth?.requires_arrival_confirm)
    return { success: false, error: "Could not start your order. Try again." };

  const { data: rows, error } = await supabase
    .from("orders")
    .update({ status: booth.print_enabled ? "confirmed" : "preparing" })
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("confirmArrival failed", error.message);
    return {
      success: false,
      error: "Could not start your order. Try again.",
    };
  }
  if (rows && rows.length > 0) return { success: true };

  // Re-read to distinguish a harmless double-tap (already preparing — the
  // vendor may have hit "Start now" first) from a genuine problem: any
  // non-pending, non-cancelled status counts as already started (idempotent
  // success); a still-pending, cancelled, or missing order reports failure.
  const { data: cur } = await supabase
    .from("orders")
    .select("status")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (cur && cur.status !== "pending" && cur.status !== "cancelled")
    return { success: true };
  return { success: false, error: "Could not start your order. Try again." };
}

export type WaitEstimate = {
  // null whenever there isn't enough recent history to trust a time-based
  // estimate — see estimateWaitSeconds's own minimum-sample-size guard. The
  // page falls back to `ordersAhead` (a queue-position label) instead of
  // showing nothing — see queuePositionLabel in @/lib/orders.
  seconds: number | null;
  ordersAhead: number;
};

/**
 * Live "ready in ~N min" estimate for one order — recent average prep time
 * (this booth's last RECENT_ORDER_LIMIT completed orders) times how many
 * orders currently rank ahead of it. Polled the same cadence as
 * getOrderStatus (this page is poll-only by design, not realtime — see
 * order-status-poller.tsx), so this recomputes live as the queue moves, not
 * a one-time snapshot. Returns null only when there's nothing to say at all
 * (invalid token, order not found) — `ordersAhead` is otherwise always
 * computable and returned even when `seconds` isn't.
 */
export async function getWaitEstimate(
  boothId: string,
  orderNumber: string,
  token: string,
): Promise<WaitEstimate | null> {
  if (!parseOrderRef(boothId, orderNumber, token).ok) return null;

  const supabase = await createServiceClient();

  // Same rationale as getOrderStatus's own guard — this is the more
  // expensive of the two (three reads, not one), polled at the same cadence.
  const allowed = await rateLimit(`wait-estimate:${token}`, 30, 60);
  if (!allowed) return null;

  const { data: target, error: targetError } = await supabase
    .from("orders")
    .select("id, status, created_at, priority_bumped_at")
    .eq("booth_id", boothId)
    .eq("order_number", orderNumber)
    .eq("access_token", token)
    .maybeSingle();
  if (targetError) {
    console.error("getWaitEstimate: target read failed", targetError.message);
    return null;
  }
  if (!target) return null;

  const activeQuery = supabase
    .from("orders")
    .select("id, status, created_at, priority_bumped_at")
    .eq("booth_id", boothId)
    .in("status", ACTIVE_STATUSES)
    .or("payment_status.neq.pending,source.neq.qr")
    .order("id");
  let active;
  try {
    active = await readKeysetRows((afterId) => {
      if (afterId !== null) activeQuery.gt("id", afterId);
      return activeQuery.limit(1000);
    });
  } catch {
    console.error(
      "getWaitEstimate: active read failed",
      "Could not load complete query results",
    );
    return null;
  }

  const { data: recent, error: recentError } = await supabase
    .from("orders")
    .select("status, created_at, ready_at, total_cents, items")
    .eq("booth_id", boothId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(RECENT_ORDER_LIMIT);
  if (recentError) {
    console.error("getWaitEstimate: recent read failed", recentError.message);
    return null;
  }

  // Vendor-set fallback (board_settings.default_prep_minutes), used only
  // when `recent` is too small for estimateWaitSeconds to trust — see its
  // own doc comment. Also reads show_wait_estimate here (same row, no extra
  // query). Decorative: any failure here just means no fallback and the
  // estimate defaulting to shown (estimateWaitSeconds already handles null
  // cleanly), never a page error.
  let fallbackAvgSeconds: number | null = null;
  let showWaitEstimate = true;
  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", boothId)
    .maybeSingle();
  if (booth?.vendor_id) {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("board_settings")
      .eq("id", booth.vendor_id)
      .maybeSingle();
    const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
    if (settings.success) {
      if (settings.data.default_prep_minutes !== null)
        fallbackAvgSeconds = settings.data.default_prep_minutes * 60;
      showWaitEstimate = settings.data.show_wait_estimate;
    }
  }

  const ordersAhead = ordersAheadOf(active ?? [], target);
  // show_wait_estimate off means never a minute guess, even with plenty of
  // real data — the queue-position label (ordersAhead, always returned
  // above) is the only thing this vendor wants shown.
  const seconds = showWaitEstimate
    ? estimateWaitSeconds(
        (recent ?? []) as StatsOrder[],
        ordersAhead,
        undefined,
        fallbackAvgSeconds,
      )
    : null;
  return { seconds, ordersAhead };
}
