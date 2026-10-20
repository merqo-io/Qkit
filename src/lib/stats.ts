import type { OrderItem, OrderStatus, PaymentStatus } from "@/lib/types";
import { formatOptions, MS_PER_DAY, MS_PER_HOUR } from "@/lib/utils";
import { sgtHour, sgtWeekday, WEEKDAY_ORDER } from "@/lib/tz";

/** A 1-day span buckets hourly; anything longer buckets one slot per day. */
export function bucketPlan(days: number): {
  buckets: number;
  bucketMs: number;
} {
  return days === 1
    ? { buckets: 24, bucketMs: MS_PER_HOUR }
    : { buckets: days, bucketMs: MS_PER_DAY };
}

// Empty-data convention across this module: rates and waits return `null` (the
// UI renders "—", never a misleading 0), while money and counts return `0`.
// e.g. avgWaitSeconds/waitSeries/pctChange → null; revenue_cents/aov_cents/
// fulfilmentRate/peakThroughput → 0.

export type StatsOrder = {
  status: OrderStatus;
  total_cents: number;
  items: OrderItem[];
  created_at: string;
  ready_at?: string | null;
  // Needed to distinguish a refund (a confirmed-paid order later cancelled) from
  // an ordinary cancellation. Optional so older callers/tests still typecheck.
  payment_status?: PaymentStatus | null;
};

export type TopItem = {
  label: string;
  quantity: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
};

export type HourBucket = {
  // 0–23, SGT
  hour: number;
  orders: number;
  revenue_cents: number;
};

export type OptionCount = { group: string; choice: string; count: number };

export type GrossMargin = {
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  // profit / revenue * 100
  marginPct: number;
};

export type StatsSummary = {
  revenue_cents: number;
  orderCount: number;
  aov_cents: number;
  cancelled: number;
  // orders that reached the completed state
  completed: number;
  // Refunds = orders that were confirmed-paid then cancelled (money collected,
  // then returned). Surfaced for the trail; revenue_cents already excludes them.
  refunds_cents: number;
  refundCount: number;
  // 0..1 — completed / (completed + cancelled)
  fulfilmentRate: number;
  // FULL per-item aggregation (quantity-sorted, capped at ITEM_CAP for safety).
  // Deliberately NOT pre-sliced to a single metric's top-N: each consumer
  // re-ranks by its own metric (TopItems by volume/revenue, MarginTable by
  // profit, the sales export by its own bound) so a low-volume but
  // high-revenue/high-margin item is never dropped before they see it.
  topItems: TopItem[];
  // always 24 entries, hour 0..23
  hourly: HourBucket[];
  // hour with the most orders, null if none
  busiestHour: number | null;
  // [7][24] order counts; row 0 = Mon (SGT)
  dayHour: number[][];
  // most-selected customization choices
  optionBreakdown: OptionCount[];
  // null when no item carries a cost
  grossMargin: GrossMargin | null;
};

/** Label an order line by name plus its selected options, e.g. "Kopi · Iced". */
function itemLabel(item: OrderItem): string {
  const options = formatOptions(item.options);
  return options ? `${item.name} · ${options}` : item.name;
}

/**
 * Percent change of current vs prior. Returns null when prior is 0 — growth
 * from nothing is undefined, and the UI should show "—" rather than ∞/NaN.
 */
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export type SeriesPoint = {
  // Bucket's representative instant (epoch ms) — the right edge of the slot, used
  // for the trend chart's dated X-axis.
  t: number;
  orders: number;
  revenue_cents: number;
};

/**
 * Slot a created_at into a fixed-size window ending nowMs. Returns the bucket
 * index (0 = oldest, buckets-1 = current) or null when the timestamp is
 * unparseable or falls outside the window. Shared by windowSeries + waitSeries
 * so the bucketing math lives (and is tested) in exactly one place.
 */
function bucketIndex(
  createdAt: string,
  nowMs: number,
  buckets: number,
  bucketMs: number,
): number | null {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const idx = buckets - 1 - Math.floor((nowMs - t) / bucketMs);
  return idx < 0 || idx >= buckets ? null : idx;
}

/**
 * Bucket orders into a fixed-size time series ending "now" — the trend line.
 * `buckets` slots of `bucketMs` each; index 0 is the oldest slot, the last is
 * the current one. Orders outside the window are ignored. Cancelled excluded.
 * Pure: nowMs is passed in (no Date.now), created_at is parsed deterministically.
 */
export function windowSeries(
  orders: StatsOrder[],
  nowMs: number,
  buckets: number,
  bucketMs: number,
): SeriesPoint[] {
  // idx 0 is the oldest slot, the last is "now". The slot's representative
  // instant is its right edge: nowMs for the last bucket, one bucketMs earlier
  // per step back.
  const series: SeriesPoint[] = Array.from({ length: buckets }, (_, idx) => ({
    t: nowMs - (buckets - 1 - idx) * bucketMs,
    orders: 0,
    revenue_cents: 0,
  }));
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const idx = bucketIndex(o.created_at, nowMs, buckets, bucketMs);
    if (idx === null) continue;
    series[idx].orders += 1;
    series[idx].revenue_cents += o.total_cents;
  }
  return series;
}

export type WaitPoint = {
  t: number;
  avgWaitSeconds: number | null;
  orders: number;
};

/** Seconds from placed→ready, per order. null if missing/invalid/negative. */
function waitOf(o: StatsOrder): number | null {
  if (!o.ready_at) return null;
  const created = Date.parse(o.created_at);
  const ready = Date.parse(o.ready_at);
  if (!Number.isFinite(created) || !Number.isFinite(ready)) return null;
  const wait = (ready - created) / 1000;
  // guard clock skew
  return wait >= 0 ? wait : null;
}

/**
 * Mean placed→ready wait (seconds) over non-cancelled orders that reached ready.
 * null when none qualify — the UI shows "—", never a misleading 0.
 */
export function avgWaitSeconds(orders: StatsOrder[]): number | null {
  let sum = 0;
  let n = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const w = waitOf(o);
    if (w === null) continue;
    sum += w;
    n += 1;
  }
  return n ? sum / n : null;
}

/**
 * A placed-to-ready wait longer than this is read as an order left sitting
 * (a test order, or one nobody marked ready until the end of the day), not a
 * real prep time. The 2026-10-16 report: a few test orders left for hours
 * pushed a plain mean to "~624 min per order".
 */
export const MAX_PREP_WAIT_SECONDS = 60 * 60;

/** Waits that count towards a prep estimate: real, not cancelled, not abandoned. */
function prepWaits(orders: StatsOrder[]): number[] {
  const waits: number[] = [];
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const w = waitOf(o);
    if (w === null || w > MAX_PREP_WAIT_SECONDS) continue;
    waits.push(w);
  }
  return waits;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Typical placed-to-ready time (seconds) for the wait estimates: the median
 * of the usable waits, so one slow or forgotten order does not move it, with
 * abandoned waits (over MAX_PREP_WAIT_SECONDS) left out. null when none
 * qualify. Stats-page averages keep using avgWaitSeconds.
 */
export function typicalPrepSeconds(orders: StatsOrder[]): number | null {
  return median(prepWaits(orders));
}

/**
 * Customer-facing wait estimate: typical prep time (typicalPrepSeconds) ×
 * orders ahead in the queue. Requires at least `minSample` usable recent
 * waits before trusting the
 * booth's own history — a booth's first order of the day would otherwise get
 * a guess built from almost nothing. Below that threshold, falls back to
 * `fallbackAvgSecondsPerOrder` (board_settings.default_prep_minutes × 60,
 * vendor-set) if the vendor configured one; null (no estimate, the page
 * falls back to a queue-position label instead — see queuePositionLabel in
 * @/lib/orders) if they didn't, matching this module's empty-data
 * convention of never showing a misleading value. Pure.
 */
export function estimateWaitSeconds(
  recentOrders: StatsOrder[],
  ordersAhead: number,
  minSample = 10,
  fallbackAvgSecondsPerOrder: number | null = null,
): number | null {
  const waits = prepWaits(recentOrders);
  if (waits.length < minSample) {
    return fallbackAvgSecondsPerOrder !== null
      ? ordersAhead * fallbackAvgSecondsPerOrder
      : null;
  }
  return ordersAhead * median(waits)!;
}

/**
 * Vendor-facing snapshot of the same data estimateWaitSeconds draws on —
 * typical prep time per order (minutes, the median from typicalPrepSeconds)
 * over the last completed orders, and how many usable waits of `minSample`
 * that's built on. Same threshold gate, so a
 * non-null `avgMinutes` here means the real estimate is live and the
 * vendor's `default_prep_minutes` fallback currently isn't in use. Settings-
 * page label only; not itself part of any customer-facing wait calculation.
 */
export function currentPrepEstimate(
  recentOrders: StatsOrder[],
  minSample = 10,
): { avgMinutes: number | null; sampleCount: number; minSample: number } {
  const waits = prepWaits(recentOrders);
  const sampleCount = waits.length;
  if (sampleCount < minSample) {
    return { avgMinutes: null, sampleCount, minSample };
  }
  return { avgMinutes: median(waits)! / 60, sampleCount, minSample };
}

/**
 * Per-bucket average wait + order volume across a window ending nowMs. Mirrors
 * windowSeries bucketing. A bucket with orders but none readied gets
 * avgWaitSeconds: null (rendered as a gap, not 0). Cancelled excluded.
 */
export function waitSeries(
  orders: StatsOrder[],
  nowMs: number,
  buckets: number,
  bucketMs: number,
): WaitPoint[] {
  const sums = Array.from({ length: buckets }, () => 0);
  const waited = Array.from({ length: buckets }, () => 0);
  const counts = Array.from({ length: buckets }, () => 0);
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const idx = bucketIndex(o.created_at, nowMs, buckets, bucketMs);
    if (idx === null) continue;
    counts[idx] += 1;
    const w = waitOf(o);
    if (w !== null) {
      sums[idx] += w;
      waited[idx] += 1;
    }
  }
  return Array.from({ length: buckets }, (_, idx) => ({
    t: nowMs - (buckets - 1 - idx) * bucketMs,
    avgWaitSeconds: waited[idx] ? sums[idx] / waited[idx] : null,
    orders: counts[idx],
  }));
}

/**
 * Busiest single clock-hour's order count (non-cancelled). 0 if none.
 * Buckets on the absolute epoch-hour grid; since SGT is a whole-hour offset
 * (UTC+8), these boundaries coincide with SGT :00 and the count is unaffected
 * by timezone — only a *labelled* hour would shift, and this returns a count.
 */
export function peakThroughput(orders: StatsOrder[]): number {
  const byHour = new Map<number, number>();
  let peak = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const slot = Math.floor(t / MS_PER_HOUR);
    const n = (byHour.get(slot) ?? 0) + 1;
    byHour.set(slot, n);
    if (n > peak) peak = n;
  }
  return peak;
}

// Safety bound on the returned per-item aggregation. Generous on purpose: it is
// not a "top N" selection (consumers do their own ranking) but a cap so a booth
// with an unusually long tail of item+option combos can't blow up the payload.
const ITEM_CAP = 50;

/**
 * A confirmed-paid order that was then cancelled = a refund. The money left
 * revenue (it's cancelled), so record it as a refund for the audit trail
 * rather than letting it vanish silently. Counts across ALL orders (not just
 * the non-cancelled set), since a refund is by definition a cancelled one.
 */
function computeRefunds(orders: StatsOrder[]): {
  refunds_cents: number;
  refundCount: number;
} {
  let refunds_cents = 0;
  let refundCount = 0;
  for (const o of orders) {
    if (o.status === "cancelled" && o.payment_status === "confirmed") {
      refunds_cents += o.total_cents;
      refundCount += 1;
    }
  }
  return { refunds_cents, refundCount };
}

/** Fold one order line's revenue/cost/quantity into its running per-label total. */
function accumulateItem(
  byLabel: Map<string, TopItem>,
  label: string,
  revenue: number,
  cost: number,
  quantity: number,
) {
  const existing = byLabel.get(label);
  if (existing) {
    existing.quantity += quantity;
    existing.revenue_cents += revenue;
    existing.cost_cents += cost;
    existing.profit_cents += revenue - cost;
    return;
  }
  byLabel.set(label, {
    label,
    quantity,
    revenue_cents: revenue,
    cost_cents: cost,
    profit_cents: revenue - cost,
  });
}

/** Fold one order line's selected options into their running per-choice pick counts. */
function accumulateOptions(
  optionMap: Map<string, OptionCount>,
  options: { group: string; choice: string }[] | undefined,
  quantity: number,
) {
  for (const opt of options ?? []) {
    const key = JSON.stringify([opt.group, opt.choice]);
    const existing = optionMap.get(key);
    if (existing) existing.count += quantity;
    else
      optionMap.set(key, {
        group: opt.group,
        choice: opt.choice,
        count: quantity,
      });
  }
}

/**
 * Single pass over every (non-cancelled) order + item: hourly/day-hour order
 * counts, per-item revenue/cost/profit aggregation (keyed by display label),
 * and per-option pick counts — the one hot loop computeStats' other, cheaper
 * derivations (topItems sort, busiestHour, grossMargin) are built from.
 */
function aggregateOrders(counted: StatsOrder[]): {
  hourly: HourBucket[];
  dayHour: number[][];
  byLabel: Map<string, TopItem>;
  optionMap: Map<string, OptionCount>;
  anyCost: boolean;
  itemRevenue: number;
  itemCost: number;
} {
  const byLabel = new Map<string, TopItem>();
  const optionMap = new Map<string, OptionCount>();
  const hourly: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue_cents: 0,
  }));
  const dayHour: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );

  let anyCost = false;
  let itemRevenue = 0;
  let itemCost = 0;

  for (const order of counted) {
    const hour = sgtHour(order.created_at);
    hourly[hour].orders += 1;
    hourly[hour].revenue_cents += order.total_cents;
    dayHour[WEEKDAY_ORDER.indexOf(sgtWeekday(order.created_at))][hour] += 1;

    for (const item of order.items) {
      const revenue = (item.price_cents ?? 0) * item.quantity;
      if (item.cost_cents != null) anyCost = true;
      const cost = (item.cost_cents ?? 0) * item.quantity;
      itemRevenue += revenue;
      itemCost += cost;

      accumulateItem(byLabel, itemLabel(item), revenue, cost, item.quantity);
      accumulateOptions(optionMap, item.options, item.quantity);
    }
  }

  return {
    hourly,
    dayHour,
    byLabel,
    optionMap,
    anyCost,
    itemRevenue,
    itemCost,
  };
}

/** Peak by order count; earliest hour wins a tie (stable, deterministic). */
function findBusiestHour(hourly: HourBucket[]): number | null {
  let busiestHour: number | null = null;
  let peak = 0;
  for (const b of hourly) {
    if (b.orders > peak) {
      peak = b.orders;
      busiestHour = b.hour;
    }
  }
  return busiestHour;
}

/**
 * Aggregate order rows into KPIs, patterns, and (cost-aware) margins. Cancelled
 * orders are excluded from revenue/items but counted for the fulfilment rate.
 * `topN` bounds the option breakdown only; `topItems` returns the full (capped)
 * aggregation for consumers to re-rank by their own metric.
 * Pure: no DB, no React, no Date — unit-testable.
 */
export function computeStats(orders: StatsOrder[], topN = 10): StatsSummary {
  const counted = orders.filter((o) => o.status !== "cancelled");
  const cancelled = orders.length - counted.length;
  const completed = counted.filter((o) => o.status === "completed").length;
  const fulfilmentDenom = completed + cancelled;
  const fulfilmentRate = fulfilmentDenom ? completed / fulfilmentDenom : 0;

  const { refunds_cents, refundCount } = computeRefunds(orders);

  const revenue_cents = counted.reduce((sum, o) => sum + o.total_cents, 0);
  const orderCount = counted.length;
  const aov_cents = orderCount ? Math.round(revenue_cents / orderCount) : 0;

  const {
    hourly,
    dayHour,
    byLabel,
    optionMap,
    anyCost,
    itemRevenue,
    itemCost,
  } = aggregateOrders(counted);

  // Quantity-sorted (revenue tiebreak) so topItems[0] is the best seller by
  // volume, but the WHOLE set (capped) is returned — no single-metric slice.
  const topItems = [...byLabel.values()]
    .sort(
      (a, b) => b.quantity - a.quantity || b.revenue_cents - a.revenue_cents,
    )
    .slice(0, ITEM_CAP);

  const optionBreakdown = [...optionMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  const busiestHour = findBusiestHour(hourly);

  // Margin only when at least one item carried a cost — otherwise profit would
  // falsely equal revenue. Revenue here is item-level (matches the cost basis).
  const grossMargin: GrossMargin | null = anyCost
    ? {
        revenue_cents: itemRevenue,
        cost_cents: itemCost,
        profit_cents: itemRevenue - itemCost,
        marginPct: itemRevenue
          ? ((itemRevenue - itemCost) / itemRevenue) * 100
          : 0,
      }
    : null;

  return {
    revenue_cents,
    orderCount,
    aov_cents,
    cancelled,
    completed,
    refunds_cents,
    refundCount,
    fulfilmentRate,
    topItems,
    hourly,
    busiestHour,
    dayHour,
    optionBreakdown,
    grossMargin,
  };
}
