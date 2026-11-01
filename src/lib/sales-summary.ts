import type { StatsSummary } from "@/lib/stats";
import { spreadsheetText } from "./spreadsheet-text";
import { centsToDollarString } from "@/lib/utils";

// ── Stable external sales contract (v1) ──────────────────────────────────────
// This is the FROZEN shape that the `/api/v1/sales/summary` route returns and
// that CSV export mirrors. It is intentionally decoupled from the internal
// StatsSummary (which can churn) so sibling -kit products and exports keep
// working across refactors. snake_case + explicit `version` = language-agnostic,
// versionable. Add fields additively; bump `version` for breaking changes.

export type SalesSummaryV1 = {
  version: 1;
  // ISO 8601, supplied by the caller
  generated_at: string;
  // "24h" | "7d" | "30d" | "90d"
  range: string;
  // a booth id, or "all"
  booth_id: string;
  revenue_cents: number;
  order_count: number;
  aov_cents: number;
  cancelled: number;
  // Money collected then returned (confirmed-paid orders that were cancelled).
  // Additive since v1 shipped; already excluded from revenue_cents.
  refunds_cents: number;
  refund_count: number;
  // 0..1
  fulfilment_rate: number;
  gross_margin: {
    revenue_cents: number;
    cost_cents: number;
    profit_cents: number;
    margin_pct: number;
  } | null;
  top_items: {
    label: string;
    quantity: number;
    revenue_cents: number;
    profit_cents: number;
  }[];
};

// The internal aggregation is the full (capped) item set; the frozen export
// stays bounded. Quantity order is inherited from computeStats, so this is the
// same top-by-volume slice the contract ships.
const EXPORT_TOP_ITEMS = 10;

export function toSalesSummaryV1(
  summary: StatsSummary,
  meta: { range: string; boothId: string; generatedAt: string },
): SalesSummaryV1 {
  const gm = summary.grossMargin;
  return {
    version: 1,
    generated_at: meta.generatedAt,
    range: meta.range,
    booth_id: meta.boothId,
    revenue_cents: summary.revenue_cents,
    order_count: summary.orderCount,
    aov_cents: summary.aov_cents,
    cancelled: summary.cancelled,
    refunds_cents: summary.refunds_cents,
    refund_count: summary.refundCount,
    fulfilment_rate: summary.fulfilmentRate,
    gross_margin: gm
      ? {
          revenue_cents: gm.revenue_cents,
          cost_cents: gm.cost_cents,
          profit_cents: gm.profit_cents,
          margin_pct: gm.marginPct,
        }
      : null,
    top_items: summary.topItems.slice(0, EXPORT_TOP_ITEMS).map((t) => ({
      label: t.label,
      quantity: t.quantity,
      revenue_cents: t.revenue_cents,
      profit_cents: t.profit_cents,
    })),
  };
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialise a sales summary to CSV: a key/value summary block, then the items
 * table with a closing total row. `items` defaults to the bounded v1 slice;
 * the dashboard export passes the full set so the Quantity column sums to the
 * real cup count. Monetary values are plain decimals (no "$") so spreadsheets
 * treat them as numbers.
 */
export function salesSummaryToCsv(
  s: SalesSummaryV1,
  items: SalesSummaryV1["top_items"] = s.top_items,
): string {
  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Generated at", spreadsheetText(s.generated_at)],
    ["Range", spreadsheetText(s.range)],
    ["Booth", spreadsheetText(s.booth_id)],
    ["Revenue", centsToDollarString(s.revenue_cents)],
    ["Orders", s.order_count],
    ["Avg order", centsToDollarString(s.aov_cents)],
    ["Cancelled", s.cancelled],
    ["Refunds", centsToDollarString(s.refunds_cents)],
    ["Refund count", s.refund_count],
    ["Fulfilment %", Math.round(s.fulfilment_rate * 100)],
  ];
  if (s.gross_margin) {
    rows.push(["Gross margin %", Math.round(s.gross_margin.margin_pct)]);
    rows.push(["Profit", centsToDollarString(s.gross_margin.profit_cents)]);
  }
  rows.push([]);
  rows.push(["Item", "Quantity", "Revenue", "Profit"]);
  for (const it of items) {
    rows.push([
      spreadsheetText(it.label),
      it.quantity,
      centsToDollarString(it.revenue_cents),
      centsToDollarString(it.profit_cents),
    ]);
  }
  const sum = (pick: (it: (typeof items)[number]) => number) =>
    items.reduce((n, it) => n + pick(it), 0);
  rows.push([
    "Total items",
    sum((it) => it.quantity),
    centsToDollarString(sum((it) => it.revenue_cents)),
    centsToDollarString(sum((it) => it.profit_cents)),
  ]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
