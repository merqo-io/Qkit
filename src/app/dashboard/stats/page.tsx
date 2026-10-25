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
import { groupReviewsByBooth, summarizeReviews } from "@/lib/reviews";
import { StatsControls } from "./stats-controls";
import { StatsView } from "./stats-view";
import { EventsPanel } from "./events-panel";
import { ReviewsCard } from "./reviews-card";
import { EventStatsView } from "./event-stats-view";
import { fetchOrders, fetchAllTimeTotals, fetchReviewRows } from "./queries";
import { PageHeader } from "@/components/widgets/page-header";

export const revalidate = 0;

const RANGE_DAYS: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

interface Props {
  searchParams: Promise<{ range?: string; booth?: string; event?: string }>;
}

export default async function StatsPage({ searchParams }: Props) {
  const {
    range: rangeParam,
    booth: boothParam,
    event: eventParam,
  } = await searchParams;
  const { vendor, entitlement } = await requireEntitledVendor();

  const supabaseEarly = await createServerClient();

  // The vendor's booths (for the live filter + per-event windows) and paid passes
  // (which double as named, permanently-viewable events) are independent reads —
  // fetch them together rather than serially on this revalidate=0 page.
  const [boothList, events] = await Promise.all([
    readAllRows((from, to) =>
      supabaseEarly
        .from("booths")
        .select("id, name")
        .eq("vendor_id", vendor.id)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabaseEarly
        .from("licenses")
        .select("id, label, valid_from, expires_at")
        .eq("vendor_id", vendor.id)
        .order("valid_from", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  const allBoothIds = boothList.map((b) => b.id);

  // Per-event view: a paid window's FULL stats, ungated (they paid) — a
  // distinct "revisit a past event" page, not the live range/today view.
  const activeEvent = eventParam
    ? events.find((e) => e.id === eventParam)
    : undefined;
  if (activeEvent) {
    return (
      <EventStatsView
        supabase={supabaseEarly}
        activeEvent={activeEvent}
        boothList={boothList}
        allBoothIds={allBoothIds}
      />
    );
  }

  // Plan gate: free + pass see today only; longitudinal history is Pro. Clamp an
  // out-of-plan (or unknown) range to the widest the entitlement allows.
  const pro = entitlement.tier === "pro";
  const allowedRanges = entitlement.statsRanges;
  const requested = rangeParam && rangeParam in RANGE_DAYS ? rangeParam : "7d";
  const range = allowedRanges.includes(requested)
    ? requested
    : (allowedRanges.at(-1) ?? "24h");
  const days = RANGE_DAYS[range];
  // eslint-disable-next-line react-hooks/purity -- the rolling-window cutoff reads the clock once per request
  const now = Date.now();
  const cutoff = new Date(now - days * MS_PER_DAY).toISOString();

  // Only honor a booth filter that belongs to this vendor; else aggregate all.
  const selectedBooth =
    boothParam && allBoothIds.includes(boothParam) ? boothParam : "all";
  const queryIds = selectedBooth === "all" ? allBoothIds : [selectedBooth];

  // Range orders, reviews, all-time totals, and (Pro only) the prior-period
  // orders are all independent reads — run them together. All-time stays across
  // every booth (allBoothIds), regardless of the selected booth/range filters,
  // so lifetime numbers never shift. The prior-period read is only needed for
  // the Pro period comparison, so it's skipped otherwise.
  const wantPrior = pro && queryIds.length > 0;
  const priorCutoff = new Date(now - 2 * days * MS_PER_DAY).toISOString();
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

  // Period comparison + trend are Pro-only.
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
      <div>
        <PageHeader eyebrow="Performance" title="Stats" />
      </div>

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
        pro={pro}
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

      <EventsPanel events={events} />
    </div>
  );
}
