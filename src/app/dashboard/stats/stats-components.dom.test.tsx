// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiRow } from "./kpi-row";
import { MarginTable } from "./margin-table";
import { ServiceSpeedChart } from "./service-speed-chart";
import { StatsView } from "./stats-view";
import type { StatsSummary, TopItem } from "@/lib/stats";

function topItem(over: Partial<TopItem> = {}): TopItem {
  return {
    label: "Kopi",
    quantity: 9,
    revenue_cents: 900,
    cost_cents: 0,
    profit_cents: 900,
    ...over,
  };
}

function summary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    revenue_cents: 10000,
    orderCount: 20,
    aov_cents: 500,
    cancelled: 2,
    completed: 18,
    refunds_cents: 0,
    refundCount: 0,
    fulfilmentRate: 0.9,
    topItems: [],
    itemTotals: { quantity: 0, revenue_cents: 0, profit_cents: 0 },
    hourly: [],
    busiestHour: null,
    dayHour: Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0),
    ),
    optionBreakdown: [],
    grossMargin: null,
    ...over,
  };
}

describe("KpiRow", () => {
  it("shows Pro cards + period deltas", () => {
    render(
      <KpiRow
        summary={summary()}
        deltas={{ revenue: 25, orders: -10, aov: 0 }}
        pro
      />,
    );
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument(); // up
    expect(screen.getByText("10%")).toBeInTheDocument(); // down, abs value
    const fulfilled = screen.getByText("Fulfilled");
    expect(fulfilled).toBeInTheDocument();
    // Shown as fulfilled / decided (18 completed of 18 + 2 cancelled) + a
    // caption that surfaces the cancelled count visibly (mobile has no hover).
    expect(screen.getByText("18/20")).toBeInTheDocument();
    expect(screen.getByText("90% · 2 cancelled")).toBeInTheDocument();
    // Cancelled has no tile of its own; its count rides in the Fulfilled caption
    // (and the range detail stays in the tooltip).
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
    expect(fulfilled.closest("[title]")).toHaveAttribute(
      "title",
      "2 cancelled",
    );
  });

  it("gives the revenue figure the whole row on a phone", () => {
    render(<KpiRow summary={summary()} deltas={null} pro />);
    // Half a row is about 118px of text there, which cut "$1,804.80" short.
    expect(screen.getByText("Revenue").closest("button")).toHaveClass(
      "col-span-2",
      "sm:col-span-1",
    );
    expect(screen.getByText("Orders").closest("button")).not.toHaveClass(
      "col-span-2",
    );
  });

  it("hides Pro-only cards and deltas on free", () => {
    render(<KpiRow summary={summary()} deltas={null} pro={false} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Fulfilled")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
    expect(screen.queryByText("25%")).not.toBeInTheDocument();
  });
});

describe("MarginTable", () => {
  it("renders nothing when there is no cost data", () => {
    const { container } = render(
      <MarginTable summary={summary({ grossMargin: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the item name wrap so Profit and Margin stay on a phone screen", () => {
    render(
      <MarginTable
        summary={summary({
          grossMargin: {
            revenue_cents: 100,
            cost_cents: 40,
            profit_cents: 60,
            marginPct: 60,
          },
          topItems: [
            {
              label: "Tonkotsu Ramen with Extra Chashu",
              quantity: 1,
              revenue_cents: 100,
              cost_cents: 40,
              profit_cents: 60,
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByText("Tonkotsu Ramen with Extra Chashu").closest("td"),
    ).toHaveClass("whitespace-normal!");
  });

  it("shows gross margin + per-item profit, ranked by profit", () => {
    render(
      <MarginTable
        summary={summary({
          grossMargin: {
            revenue_cents: 500,
            cost_cents: 140,
            profit_cents: 360,
            marginPct: 72,
          },
          topItems: [
            {
              label: "Teh",
              quantity: 1,
              revenue_cents: 100,
              cost_cents: 40,
              profit_cents: 60,
            },
            {
              label: "Kopi",
              quantity: 2,
              revenue_cents: 400,
              cost_cents: 100,
              profit_cents: 300,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/72%/)).toBeInTheDocument(); // gross margin header
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument(); // Kopi profit
    expect(screen.getByText("75%")).toBeInTheDocument(); // Kopi margin 300/400
    // Kopi (300) ranks above Teh (60).
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Kopi");
    expect(rows[2]).toHaveTextContent("Teh");
  });
});

describe("ServiceSpeedChart", () => {
  const series = [
    { t: 1, avgWaitSeconds: 120, orders: 3 },
    { t: 2, avgWaitSeconds: 300, orders: 8 },
  ];

  it("renders the heading and peak throughput", () => {
    render(<ServiceSpeedChart series={series} range="7d" peakThroughput={8} />);
    expect(screen.getByText(/service speed/i)).toBeInTheDocument();
    expect(screen.getByText(/8\s*\/\s*hr/i)).toBeInTheDocument();
  });

  it("renders without crashing when no order has a wait (empty / all-null)", () => {
    const noWaits = [
      { t: 1, avgWaitSeconds: null, orders: 2 },
      { t: 2, avgWaitSeconds: null, orders: 5 },
    ];
    render(
      <ServiceSpeedChart series={noWaits} range="7d" peakThroughput={5} />,
    );
    // Header still renders; the avg reference line is simply omitted (no crash,
    // no misleading zero line).
    expect(screen.getByText(/service speed/i)).toBeInTheDocument();
    expect(screen.getByText(/5\s*\/\s*hr/i)).toBeInTheDocument();
  });
});

describe("StatsView", () => {
  it("shows the empty state when there are no orders", () => {
    render(
      <StatsView
        summary={summary({ orderCount: 0 })}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
      />,
    );
    expect(screen.getByText(/no orders yet/i)).toBeInTheDocument();
  });

  it("pro: pins the metric strip + at-a-glance highlights above three tabs", () => {
    render(
      <StatsView
        summary={summary({
          topItems: [topItem({ label: "Kopi", quantity: 9 })],
          busiestHour: 12,
          hourly: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            orders: hour === 12 ? 9 : 0,
            revenue_cents: 0,
          })),
        })}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
      />,
    );
    // Range indicator names the window the KPIs are scoped to.
    expect(screen.getByText("Showing")).toBeInTheDocument();
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
    // At-a-glance context tiles (historical, from the summary).
    expect(screen.getByText("Best seller")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("Busiest hour")).toBeInTheDocument();
    expect(screen.getByText("12pm")).toBeInTheDocument();
    // Three touch tabs, Sales selected by default.
    expect(screen.getByRole("tab", { name: /sales/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /items/i })).toBeInTheDocument();
    const service = screen.getByRole("tab", { name: /service/i });
    expect(service).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sales/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(service).toHaveAttribute("data-state", "inactive");
    // Export stays reachable from the pinned strip.
    expect(
      screen.getByRole("button", { name: /export csv/i }),
    ).toBeInTheDocument();
  });

  it("free: no tabs, but keeps the highlights + upgrade CTA", () => {
    render(
      <StatsView
        summary={summary({
          topItems: [topItem({ label: "Teh" })],
          busiestHour: 9,
          hourly: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            orders: hour === 9 ? 4 : 0,
            revenue_cents: 0,
          })),
        })}
        deltas={null}
        series={null}
        range="24h"
        boothId="all"
        pro={false}
        speed={{ avgWaitSeconds: 90, series: null, peakThroughput: 0 }}
      />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // 24h range collapses to the friendlier "today" caption.
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.getByText("Best seller")).toBeInTheDocument();
    expect(screen.getByText("Avg wait")).toBeInTheDocument();
    expect(screen.getByText(/upgrade/i)).toBeInTheDocument();
  });

  it("shows the all-time totals as captions under Revenue and Orders", () => {
    render(
      <StatsView
        summary={summary()}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
        allTime={{ orders: 512, revenue_cents: 1234500 }}
      />,
    );
    // Lifetime numbers ride as "all time" captions, distinct from the range KPIs.
    expect(screen.getByText("$12,345.00 all time")).toBeInTheDocument();
    expect(screen.getByText("512 all time")).toBeInTheDocument();
  });

  it("hides the all-time captions when there are no lifetime orders", () => {
    render(
      <StatsView
        summary={summary()}
        deltas={null}
        series={null}
        range="7d"
        boothId="all"
        pro
        allTime={{ orders: 0, revenue_cents: 0 }}
      />,
    );
    expect(screen.queryByText(/all time/)).not.toBeInTheDocument();
  });
});
