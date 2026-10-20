import type { SupabaseClient } from "@supabase/supabase-js";
import { BackButton } from "@merqo/ui";
import { bucketPlan, computeStats, windowSeries } from "@/lib/stats";
import { MS_PER_DAY } from "@/lib/utils";
import { shortDay } from "@/lib/tz";
import { eventLabel, type EventLicense } from "@/lib/events";
import { groupReviewsByBooth, summarizeReviews } from "@/lib/reviews";
import type { Database } from "@/lib/types";
import { fetchOrders, fetchEventReviewRows } from "./queries";
import { StatsView } from "./stats-view";
import { ReviewsCard } from "./reviews-card";
import { PageHeader } from "@/components/widgets/page-header";

interface Props {
  supabase: SupabaseClient<Database>;
  activeEvent: EventLicense;
  boothList: { id: string; name: string }[];
  allBoothIds: string[];
}

/**
 * A paid event window's FULL stats, ungated (the vendor paid for this pass) —
 * the "revisit a past event" view, distinct from the live range/today view.
 */
export async function EventStatsView({
  supabase,
  activeEvent,
  boothList,
  allBoothIds,
}: Props) {
  const from = activeEvent.valid_from;
  const to = activeEvent.expires_at;
  const [orders, eventRows] = await Promise.all([
    fetchOrders(supabase, allBoothIds, from, to),
    fetchEventReviewRows(supabase, allBoothIds, from, to),
  ]);
  const summary = computeStats(orders);
  const spanDays = Math.max(
    1,
    Math.ceil((Date.parse(to) - Date.parse(from)) / MS_PER_DAY),
  );
  // Anchored to the window end so the trend lines up with the event, not "now".
  const { buckets, bucketMs } = bucketPlan(spanDays);
  const series = windowSeries(orders, Date.parse(to), buckets, bucketMs);
  // Reviews for orders placed during this event — by order date, so late
  // reviews (written after the event ended) still belong to it.
  const eventGroups = groupReviewsByBooth(eventRows, boothList);
  const eventOverall = summarizeReviews(eventRows);

  return (
    <div className="space-y-7">
      <div>
        <div className="mb-2">
          <BackButton href="/dashboard/stats" label="All stats" />
        </div>
        <PageHeader
          eyebrow={
            <>
              Event · {shortDay(Date.parse(from))} – {shortDay(Date.parse(to))}{" "}
              · always available
            </>
          }
          title={eventLabel(activeEvent)}
        />
      </div>
      {/* Paid window → full stats regardless of current plan. Hide the trend
          chart for an empty (zero-revenue) event. */}
      <StatsView
        summary={summary}
        deltas={null}
        series={summary.revenue_cents > 0 ? series : null}
        range="event"
        boothId="all"
        pro
      />

      <ReviewsCard
        groups={eventGroups}
        overall={eventOverall}
        selected="all"
        linkable={false}
      />
    </div>
  );
}
