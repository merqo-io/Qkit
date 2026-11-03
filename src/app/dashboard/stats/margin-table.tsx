"use client";

// Client component: @merqo/ui ships as an all-"use client" bundle, so its
// DataTable is a Client Component. `columns` here holds `cell`/`getRowKey`
// functions — non-serializable props that would throw if this stayed a Server
// Component and passed them across the server→client boundary.

import { DataTable, type DataTableColumn } from "@merqo/ui";
import { formatPrice } from "@/lib/utils";
import type { StatsSummary, TopItem } from "@/lib/stats";

const columns: DataTableColumn<TopItem>[] = [
  // The name wraps. Kept on one line (the table cell's default) a long item
  // name made the table twice the width of a phone, with Profit and Margin,
  // the two columns this table exists for, off screen behind a sideways
  // scroll.
  {
    header: "Item",
    cell: (i) => i.label,
    className: "min-w-24 whitespace-normal!",
  },
  {
    header: "Sold",
    cell: (i) => i.quantity,
    className: "text-right font-mono tabular-nums text-muted-foreground",
  },
  {
    header: "Profit",
    cell: (i) => formatPrice(i.profit_cents),
    className: "text-right font-mono tabular-nums",
  },
  {
    header: "Margin",
    cell: (i) => {
      const marginPct = i.revenue_cents
        ? (i.profit_cents / i.revenue_cents) * 100
        : 0;
      return `${Math.round(marginPct)}%`;
    },
    className: "text-right font-mono tabular-nums",
  },
];

/**
 * Profitability view (trends). Renders only when the vendor has entered at least
 * one item cost (`grossMargin` non-null). Ranks items by profit contribution —
 * what actually makes money, not just what sells most.
 */
export function MarginTable({ summary }: { summary: StatsSummary }) {
  const gm = summary.grossMargin;
  if (!gm) return null;

  // Rank by profit contribution, then take the top slice. topItems is the full
  // per-item set (capped at 50 by quantity), so a high-margin lower-volume item
  // within it can reach the top of this table.
  const ranked = summary.topItems
    .filter((i) => i.cost_cents > 0)
    .sort((a, b) => b.profit_cents - a.profit_cents)
    .slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Profit &amp; margin
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          Gross margin{" "}
          <span className="font-mono font-semibold text-foreground">
            {Math.round(gm.marginPct)}%
          </span>{" "}
          · {formatPrice(gm.profit_cents)} profit
        </p>
      </div>

      <DataTable rows={ranked} columns={columns} getRowKey={(i) => i.label} />
    </section>
  );
}
