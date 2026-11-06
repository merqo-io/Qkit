import { cn, formatPrice } from "@/lib/utils";
import type { StatsSummary } from "@/lib/stats";
import { StatCard, DeltaPill } from "@merqo/ui";
import { StatBreakdownTile, type BreakdownRow } from "./stat-breakdown";
import { WIDE_ON_PHONE } from "./tile-layout";

type Deltas = {
  revenue: number | null;
  orders: number | null;
  aov: number | null;
} | null;

function Delta({ pct }: { pct: number | null }) {
  return (
    <DeltaPill
      pct={pct}
      tooltip="vs the previous period"
      downClassName="bg-status-cancelled/12 text-status-cancelled"
    />
  );
}

/**
 * The one tile the whole stats strip is built from — wraps `@merqo/ui`'s shared
 * `StatCard` with its elevated shell flattened back to qkit's bordered,
 * fade-rise-animated frame with an ember `primary` accent. Money KPIs, order counts, and
 * the qualitative context tiles (best seller, busiest hour, avg wait) all render
 * through this, so the strip reads as one grid instead of a mix of styles.
 */
export function StatTile({
  label,
  value,
  delta,
  caption,
  hint,
  primary,
  wide,
  index = 0,
}: {
  label: string;
  value: string;
  delta?: number | null;
  caption?: string;
  /** Hover tooltip (native title), e.g. the cancelled count behind Fulfilled. */
  hint?: string;
  primary?: boolean;
  /** Takes the whole row on a phone, where half a row cuts its value off. */
  wide?: boolean;
  index?: number;
}) {
  return (
    // The card takes no inline style, so the animation lives on this wrapper.
    <div
      className={cn("fade-rise", wide && WIDE_ON_PHONE)}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <StatCard
        label={label}
        value={value}
        className={cn(
          "h-full rounded-xl shadow-none",
          primary ? "border-primary/30" : "border-border",
        )}
        valueClassName="font-mono"
        captionClassName="font-mono"
        caption={caption}
        hint={hint}
        primary={primary}
        delta={delta}
        deltaTooltip="vs the previous period"
        deltaDownClassName="bg-status-cancelled/12 text-status-cancelled"
      />
    </div>
  );
}

/**
 * Range KPI band — the money/orders numbers for the SELECTED window. Revenue
 * leads (top-left, ember-framed) per the F-pattern. Free plans see
 * Revenue/Orders/AOV; Trends add fulfilment, cancelled, and refunds plus the
 * period-over-period deltas. Values are range-scoped — the strip's "Showing …"
 * caption above names the window.
 */
export function KpiRow({
  summary,
  deltas,
  trends,
  rangeLabel,
  allTime,
}: {
  summary: StatsSummary;
  deltas: Deltas;
  trends: boolean;
  rangeLabel?: string;
  allTime?: { orders: number; revenue_cents: number };
}) {
  const rl = rangeLabel ? ` · ${rangeLabel}` : "";
  const cancelledHint =
    summary.cancelled === 0
      ? `No cancellations${rl}`
      : `${summary.cancelled} cancelled${rl}`;

  // Per-item breakdowns behind the Revenue and Orders tiles (hover / tap).
  const revenueRows: BreakdownRow[] = [...summary.topItems]
    .filter((i) => i.revenue_cents > 0)
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, 6)
    .map((i) => ({ label: i.label, value: formatPrice(i.revenue_cents) }));
  const orderRows: BreakdownRow[] = [...summary.topItems]
    .filter((i) => i.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6)
    .map((i) => ({ label: i.label, value: String(i.quantity) }));

  // Lifetime totals ride as a caption under the matching range tile (hidden for
  // a brand-new vendor with no all-time orders).
  const showAllTime = allTime !== undefined && allTime.orders > 0;
  const revenueCaption = showAllTime
    ? `${formatPrice(allTime.revenue_cents)} all time`
    : undefined;
  const ordersCaption = showAllTime ? `${allTime.orders} all time` : undefined;

  // Fulfilled = completed / decided (completed + cancelled). Cancelled count in
  // the visible caption since mobile has no hover; range detail in the tooltip.
  const decided = summary.completed + summary.cancelled;
  const fulfilledValue =
    decided > 0 ? `${summary.completed}/${decided}` : "0/0";
  const pct = Math.round(summary.fulfilmentRate * 100);
  const fulfilledCaption =
    summary.cancelled > 0
      ? `${pct}% · ${summary.cancelled} cancelled`
      : `${pct}% fulfilled`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatBreakdownTile
        label="Revenue"
        value={formatPrice(summary.revenue_cents)}
        caption={revenueCaption}
        rows={revenueRows}
        breakdownLabel="Revenue by item"
        deltaSlot={<Delta pct={deltas?.revenue ?? null} />}
        primary
        wide
        index={0}
      />
      <StatBreakdownTile
        label="Orders"
        value={String(summary.orderCount)}
        caption={ordersCaption}
        rows={orderRows}
        breakdownLabel="Orders by item"
        deltaSlot={<Delta pct={deltas?.orders ?? null} />}
        index={1}
      />
      <StatTile
        label="Avg order"
        value={formatPrice(summary.aov_cents)}
        delta={deltas?.aov}
        index={2}
      />
      {trends && (
        <>
          <StatTile
            label="Fulfilled"
            value={fulfilledValue}
            caption={fulfilledCaption}
            hint={cancelledHint}
            index={3}
          />
          {summary.refundCount > 0 && (
            <StatTile
              label="Refunds"
              value={formatPrice(summary.refunds_cents)}
              index={4}
            />
          )}
        </>
      )}
    </div>
  );
}
