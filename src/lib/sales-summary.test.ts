import { describe, expect, it } from "vitest";
import {
  salesSummaryToCsv,
  toSalesSummaryV1,
  type SalesSummaryV1,
} from "./sales-summary";
import type { StatsSummary } from "./stats";

function summary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    revenue_cents: 500,
    orderCount: 3,
    aov_cents: 167,
    cancelled: 1,
    completed: 3,
    refunds_cents: 0,
    refundCount: 0,
    fulfilmentRate: 0.75,
    topItems: [
      {
        label: "Kopi",
        quantity: 2,
        revenue_cents: 400,
        cost_cents: 100,
        profit_cents: 300,
      },
    ],
    hourly: [],
    busiestHour: null,
    dayHour: [],
    optionBreakdown: [],
    grossMargin: {
      revenue_cents: 500,
      cost_cents: 140,
      profit_cents: 360,
      marginPct: 72,
    },
    ...over,
  };
}

const meta = {
  range: "7d",
  boothId: "all",
  generatedAt: "2026-06-16T00:00:00Z",
};

describe("toSalesSummaryV1", () => {
  it("maps internal stats to the frozen v1 contract", () => {
    const out = toSalesSummaryV1(summary(), meta);
    expect(out).toEqual<SalesSummaryV1>({
      version: 1,
      generated_at: "2026-06-16T00:00:00Z",
      range: "7d",
      booth_id: "all",
      revenue_cents: 500,
      order_count: 3,
      aov_cents: 167,
      cancelled: 1,
      refunds_cents: 0,
      refund_count: 0,
      fulfilment_rate: 0.75,
      gross_margin: {
        revenue_cents: 500,
        cost_cents: 140,
        profit_cents: 360,
        margin_pct: 72,
      },
      top_items: [
        { label: "Kopi", quantity: 2, revenue_cents: 400, profit_cents: 300 },
      ],
    });
  });

  it("carries a null gross_margin when no cost data", () => {
    const out = toSalesSummaryV1(summary({ grossMargin: null }), meta);
    expect(out.gross_margin).toBeNull();
  });

  it("bounds top_items to the export cap (the internal set is now full)", () => {
    // computeStats returns the full per-item aggregation; the frozen export
    // stays bounded to its top-by-quantity slice.
    const many = Array.from({ length: 15 }, (_, i) => ({
      label: `Item ${i}`,
      quantity: 15 - i,
      revenue_cents: 100,
      cost_cents: 0,
      profit_cents: 100,
    }));
    const out = toSalesSummaryV1(summary({ topItems: many }), meta);
    expect(out.top_items).toHaveLength(10);
    expect(out.top_items[0].label).toBe("Item 0"); // input order preserved
  });
});

describe("salesSummaryToCsv", () => {
  it("lists every supplied item and a Total items row, while top_items stays at 10", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i}`,
      quantity: 12 - i,
      revenue_cents: 100,
      cost_cents: 40,
      profit_cents: 60,
    }));
    const v1 = toSalesSummaryV1(summary({ topItems: many }), meta);
    expect(v1.top_items).toHaveLength(10);
    const lines = salesSummaryToCsv(v1, many).split("\n");
    const start = lines.indexOf("Item,Quantity,Revenue,Profit");
    expect(lines.slice(start + 1)).toHaveLength(13);
    expect(lines.at(-1)).toBe("Total items,78,12.00,7.20");
  });

  it("emits a summary block then an items table", () => {
    const csv = salesSummaryToCsv(toSalesSummaryV1(summary(), meta));
    expect(csv).toContain("Metric,Value");
    expect(csv).toContain("Revenue,5.00");
    expect(csv).toContain("Gross margin %,72");
    expect(csv).toContain("Item,Quantity,Revenue,Profit");
    expect(csv).toContain("Kopi,2,4.00,3.00");
  });

  it("quotes cells containing commas", () => {
    const csv = salesSummaryToCsv(
      toSalesSummaryV1(
        summary({
          topItems: [
            {
              label: "Kopi, Iced",
              quantity: 1,
              revenue_cents: 100,
              cost_cents: 0,
              profit_cents: 100,
            },
          ],
        }),
        meta,
      ),
    );
    expect(csv).toContain('"Kopi, Iced",1,1.00,1.00');
  });

  it("escapes embedded quotes and newlines in a cell", () => {
    const csv = salesSummaryToCsv(
      toSalesSummaryV1(
        summary({
          topItems: [
            {
              label: 'Kopi "O"\nHot',
              quantity: 1,
              revenue_cents: 100,
              cost_cents: 0,
              profit_cents: 100,
            },
          ],
        }),
        meta,
      ),
    );
    // A double-quote is doubled and the whole cell wrapped in quotes.
    expect(csv).toContain('"Kopi ""O""\nHot",1,1.00,1.00');
  });
});

it("neutralizes untrusted CSV text while keeping negative money numeric and quoting carriage returns", () => {
  const out = toSalesSummaryV1(summary(), meta);
  out.top_items = [
    { label: "=1+1", quantity: 1, revenue_cents: 100, profit_cents: -100 },
    { label: "Tea\rHot", quantity: 1, revenue_cents: 100, profit_cents: 0 },
  ];
  out.range = "  +SUM(1)";
  out.booth_id = "@formula";
  const csv = salesSummaryToCsv(out);
  expect(csv).toContain("'=1+1,1,1.00,-1.00");
  expect(csv).toContain("Range,'  +SUM(1)");
  expect(csv).toContain("Booth,'@formula");
  expect(csv).toContain('"Tea\rHot",1,1.00,0.00');
});
