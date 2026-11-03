import { isStatsRange, type StatsRange } from "@/lib/plan";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import { rateLimit } from "@/lib/rate-limit";
import { computeStats, type StatsOrder } from "@/lib/stats";
import { fetchOrders } from "@/app/dashboard/stats/queries";
import { toSalesSummaryV1 } from "@/lib/sales-summary";
import { MS_PER_DAY } from "@/lib/utils";

// Read-only sales summary, v1 of the external contract (see lib/sales-summary).
// AUTH: currently the vendor's Supabase session (cookie) — so it serves the
// vendor's own browser / same-origin callers, and RLS scopes every row. Machine
// auth (per-vendor API keys) for cross-product (sibling -kit) access is a
// deliberate FUTURE step — designed around the real consumer, not pre-built.
// The response SHAPE is frozen now so that integration won't require a rewrite.

const RANGE_DAYS: Record<StatsRange, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function GET(request: Request) {
  const { user, vendor, entitlement } = await loadEntitlement();
  if (!user || !vendor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = entitlement.statsRanges;
  const params = new URL(request.url).searchParams;
  const rangeParam = params.get("range");
  const requested: StatsRange = isStatsRange(rangeParam) ? rangeParam : "7d";
  const range = allowed.includes(requested)
    ? requested
    : (allowed.at(-1) ?? "24h");
  const days = RANGE_DAYS[range];
  const generatedAt = new Date().toISOString();
  // A pass-only vendor may not see history from before the pass started.
  const floorMs = entitlement.statsSince
    ? Date.parse(entitlement.statsSince)
    : 0;
  const cutoff = new Date(
    Math.max(Date.parse(generatedAt) - days * MS_PER_DAY, floorMs),
  ).toISOString();

  const supabase = await createServerClient();

  // RLS scopes every row to the caller's own booths, so this is only
  // self-inflicted DB load, not a cross-tenant issue -- still worth capping.
  const rateOk = await rateLimit(`sales-summary:${user.id}`, 30, 60);
  if (!rateOk) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Resolve booth filter against the vendor's own booths (RLS-scoped read).
  // This is a revenue contract consumed by sibling products — a transient DB
  // error must FAIL LOUD (503), never silently return {revenue: 0} zeros, which
  // would make a downstream consumer under-invoice with no signal.
  const { data: booths, error: boothErr } = await supabase
    .from("booths")
    .select("id")
    .eq("vendor_id", vendor.id);
  if (boothErr) {
    console.error("sales summary: booths read failed", boothErr.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const boothIds = (booths ?? []).map((b) => b.id);
  const boothParam = params.get("booth");
  const boothId =
    boothParam && boothIds.includes(boothParam) ? boothParam : "all";
  const queryIds = boothId === "all" ? boothIds : [boothId];

  let orders: StatsOrder[] = [];
  if (queryIds.length) {
    try {
      orders = await fetchOrders(supabase, queryIds, cutoff, generatedAt);
    } catch {
      console.error("sales summary: orders read failed");
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 503 },
      );
    }
  }

  const summary = computeStats(orders);
  return NextResponse.json(
    toSalesSummaryV1(summary, { range, boothId, generatedAt }),
  );
}
