import {
  bucketPlan,
  computeStats,
  pctChange,
  windowSeries,
  avgWaitSeconds,
  waitSeries,
  peakThroughput,
  type SeriesPoint,
  type WaitPoint,
} from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { MS_PER_DAY } from "@/lib/utils";
import { isStatsRange, type StatsRange } from "@/lib/plan";
import { groupReviewsByBooth, summarizeReviews } from "@/lib/reviews";
import { StatsControls } from "./stats-controls";
import { StatsView } from "./stats-view";
import { ReviewsCard } from "./reviews-card";
import { fetchOrders, fetchAllTimeTotals, fetchReviewRows } from "./queries";
import { PageHeader } from "@merqo/ui";

export const revalidate = 0;

const RANGE_DAYS: Record<StatsRange, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface Props {
  searchParams: Promise<{ range?: string; booth?: string }>;
}

export default async function StatsPage({ searchParams }: Props) {
  const { range: rangeParam, booth: boothParam } = await searchParams;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabaseEarly = await createServerClient();

  const boothList = await readAllRows((from, to) =>
    supabaseEarly
      .from("booths")
      .select("id, name")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );
  const allBoothIds = boothList.map((b) => b.id);

  // Plan gate: ranges come from the entitlement (24h only, or the longer ones).
  // Clamp an out-of-plan (or unknown) range to the widest it allows.
  const trends = entitlement.statsRanges.length > 1;
  const allowedRanges = entitlement.statsRanges;
  const requested = isStatsRange(rangeParam) ? rangeParam : "7d";
  const range = allowedRanges.includes(requested)
    ? requested
    : (allowedRanges.at(-1) ?? "24h");
  const days = RANGE_DAYS[range];
  // eslint-disable-next-line react-hooks/purity -- the rolling-window cutoff reads the clock once per request
  const now = Date.now();
  // A pass-only vendor may not see history from before the pass started.
  const floorMs = entitlement.statsSince
    ? Date.parse(entitlement.statsSince)
    : 0;
  const cutoffMs = Math.max(now - days * MS_PER_DAY, floorMs);
  const cutoff = new Date(cutoffMs).toISOString();

  // Only honor a booth filter that belongs to this vendor; else aggregate all.
  const selectedBooth =
    boothParam && allBoothIds.includes(boothParam) ? boothParam : "all";
  const queryIds = selectedBooth === "all" ? allBoothIds : [selectedBooth];

  // Range orders, reviews, all-time totals, and (trends only) the prior-period
  // orders are all independent reads — run them together. All-time stays across
  // every booth (allBoothIds), regardless of the selected booth/range filters,
  // so lifetime numbers never shift. The prior-period read is only needed for
  // the trend period comparison, so it's skipped otherwise.
  const wantPrior = trends && queryIds.length > 0;
  const priorCutoff = new Date(
    Math.max(now - 2 * days * MS_PER_DAY, floorMs),
  ).toISOString();
  const [orders, reviewRows, allTime, priorOrders] = await Promise.all([
    fetchOrders(supabaseEarly, queryIds, cutoff),
    fetchReviewRows(supabaseEarly, allBoothIds),
    fetchAllTimeTotals(supabaseEarly, allBoothIds),
    wantPrior
      ? fetchOrders(supabaseEarly, queryIds, priorCutoff, cutoff)
      : Promise.resolve([]),
  ]);
  const summary = computeStats(orders);
  const avgWait = avgWaitSeconds(orders);

  const reviewGroups = groupReviewsByBooth(reviewRows, boothList);
  const reviewOverall = summarizeReviews(reviewRows);

  // Period comparison + trend are trends-only.
  let deltas: {
    revenue: number | null;
    orders: number | null;
    aov: number | null;
  } | null = null;
  let series: SeriesPoint[] | null = null;
  let waitPoints: WaitPoint[] | null = null;
  let peak = 0;
  if (wantPrior) {
    const prior = computeStats(priorOrders);
    deltas = {
      revenue: pctChange(summary.revenue_cents, prior.revenue_cents),
      orders: pctChange(summary.orderCount, prior.orderCount),
      aov: pctChange(summary.aov_cents, prior.aov_cents),
    };
    const { buckets, bucketMs } = bucketPlan(days);
    series = windowSeries(orders, now, buckets, bucketMs);
    waitPoints = waitSeries(orders, now, buckets, bucketMs);
    peak = peakThroughput(orders);
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Performance" title="Stats" />

      <StatsControls
        range={range}
        booth={selectedBooth}
        booths={boothList}
        allowedRanges={allowedRanges}
      />

      <StatsView
        summary={summary}
        deltas={deltas}
        series={series}
        range={range}
        boothId={selectedBooth}
        trends={trends}
        speed={{
          avgWaitSeconds: avgWait,
          series: waitPoints,
          peakThroughput: peak,
        }}
        allTime={allTime}
      />

      <ReviewsCard
        groups={reviewGroups}
        overall={reviewOverall}
        selected={selectedBooth}
        range={range}
      />
    </div>
  );
}
