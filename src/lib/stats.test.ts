import { describe, expect, it } from "vitest";
import {
  avgWaitSeconds,
  estimateWaitSeconds,
  currentPrepEstimate,
  typicalPrepSeconds,
  MAX_PREP_WAIT_SECONDS,
  computeStats,
  pctChange,
  waitSeries,
  peakThroughput,
  windowSeries,
  type StatsOrder,
} from "./stats";

function order(
  status: StatsOrder["status"],
  total_cents: number,
  items: StatsOrder["items"] = [],
  created_at = "2026-06-12T04:00:00Z", // 12:00 SGT
): StatsOrder {
  return { status, total_cents, items, created_at };
}

describe("computeStats", () => {
  it("keeps distinct group and choice pairs separate when their concatenations match", () => {
    const result = computeStats([
      order("completed", 0, [
        {
          menuItemId: "a",
          name: "Tea",
          quantity: 2,
          options: [{ group: "AB", choice: "C" }],
        },
        {
          menuItemId: "b",
          name: "Coffee",
          quantity: 3,
          options: [{ group: "A", choice: "BC" }],
        },
      ]),
    ]);
    expect(result.optionBreakdown).toEqual([
      { group: "A", choice: "BC", count: 3 },
      { group: "AB", choice: "C", count: 2 },
    ]);
  });
  it("returns zeros for no orders", () => {
    const s = computeStats([]);
    expect(s.revenue_cents).toBe(0);
    expect(s.orderCount).toBe(0);
    expect(s.aov_cents).toBe(0);
    expect(s.topItems).toEqual([]);
    expect(s.hourly).toHaveLength(24);
    expect(s.hourly.every((b) => b.orders === 0)).toBe(true);
    expect(s.busiestHour).toBeNull();
  });

  it("buckets orders by SGT hour and reports the busiest", () => {
    const s = computeStats([
      order("completed", 500, [], "2026-06-12T04:00:00Z"), // 12:00 SGT
      order("ready", 500, [], "2026-06-12T04:30:00Z"), // 12:30 SGT
      order("completed", 300, [], "2026-06-12T01:00:00Z"), // 09:00 SGT
    ]);
    expect(s.busiestHour).toBe(12);
    expect(s.hourly[12]).toEqual({ hour: 12, orders: 2, revenue_cents: 1000 });
    expect(s.hourly[9]).toEqual({ hour: 9, orders: 1, revenue_cents: 300 });
  });

  it("sums revenue and counts orders, AOV = revenue / count", () => {
    const s = computeStats([order("completed", 500), order("ready", 1500)]);
    expect(s.revenue_cents).toBe(2000);
    expect(s.orderCount).toBe(2);
    expect(s.aov_cents).toBe(1000);
  });

  it("rounds AOV to integer cents", () => {
    const s = computeStats([order("completed", 100), order("completed", 101)]);
    expect(s.aov_cents).toBe(101); // 201 / 2 = 100.5 -> 101
  });

  it("excludes cancelled orders from every metric", () => {
    const s = computeStats([
      order("completed", 1000, [
        { menuItemId: "a", name: "Kopi", price_cents: 1000, quantity: 1 },
      ]),
      order("cancelled", 9999, [
        { menuItemId: "a", name: "Kopi", price_cents: 9999, quantity: 5 },
      ]),
    ]);
    expect(s.revenue_cents).toBe(1000);
    expect(s.orderCount).toBe(1);
    expect(s.topItems).toEqual([
      {
        label: "Kopi",
        quantity: 1,
        revenue_cents: 1000,
        cost_cents: 0,
        profit_cents: 1000,
      },
    ]);
  });

  it("aggregates top items by name, ranks by quantity", () => {
    const s = computeStats([
      order("completed", 0, [
        { menuItemId: "a", name: "Kopi", price_cents: 140, quantity: 2 },
        { menuItemId: "b", name: "Teh", price_cents: 140, quantity: 1 },
      ]),
      order("completed", 0, [
        { menuItemId: "a", name: "Kopi", price_cents: 140, quantity: 3 },
      ]),
    ]);
    expect(s.topItems).toEqual([
      {
        label: "Kopi",
        quantity: 5,
        revenue_cents: 700,
        cost_cents: 0,
        profit_cents: 700,
      },
      {
        label: "Teh",
        quantity: 1,
        revenue_cents: 140,
        cost_cents: 0,
        profit_cents: 140,
      },
    ]);
  });

  it("keys top items by name + options (option-aware)", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 140,
          quantity: 1,
          options: [{ group: "Temperature", choice: "Iced" }],
        },
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 140,
          quantity: 1,
          options: [{ group: "Temperature", choice: "Hot" }],
        },
      ]),
    ]);
    const labels = s.topItems.map((t) => t.label).sort();
    expect(labels).toEqual(["Kopi · Hot", "Kopi · Iced"]);
  });

  it("counts unpriced items toward quantity but 0 revenue", () => {
    const s = computeStats([
      order("completed", 0, [{ menuItemId: "w", name: "Water", quantity: 4 }]),
    ]);
    expect(s.topItems).toEqual([
      {
        label: "Water",
        quantity: 4,
        revenue_cents: 0,
        cost_cents: 0,
        profit_cents: 0,
      },
    ]);
  });

  it("returns the FULL per-item aggregation, not a single-metric top-N slice", () => {
    // topItems returns the FULL per-item aggregation, not a top-N by quantity
    // slice, so a low-volume but high-revenue/high-margin item still reaches the
    // revenue/profit consumers (TopItems "By revenue", MarginTable, the sales export).
    const items = Array.from({ length: 15 }, (_, i) => ({
      menuItemId: `i${i}`,
      name: `Item ${i}`,
      price_cents: 100,
      quantity: i + 1,
    }));
    const s = computeStats([order("completed", 0, items)], 10);
    expect(s.topItems).toHaveLength(15); // all 15, not sliced to topN
    expect(s.topItems[0].label).toBe("Item 14"); // still quantity-sorted
  });

  it("caps the per-item aggregation at a generous safety bound", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      menuItemId: `i${i}`,
      name: `Item ${i}`,
      price_cents: 100,
      quantity: i + 1,
    }));
    const s = computeStats([order("completed", 0, items)]);
    expect(s.topItems).toHaveLength(50); // ITEM_CAP
  });

  it("breaks a busiest-hour tie toward the earlier hour (stable)", () => {
    const s = computeStats([
      order("completed", 100, [], "2026-06-12T01:00:00Z"), // 09:00 SGT
      order("completed", 100, [], "2026-06-12T04:00:00Z"), // 12:00 SGT
    ]);
    expect(s.busiestHour).toBe(9); // 1 vs 1 tie -> earliest wins (strict >)
  });
});

describe("pctChange", () => {
  it("computes percent change", () => {
    expect(pctChange(150, 100)).toBeCloseTo(50);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
    expect(pctChange(100, 100)).toBe(0);
  });

  it("is null when prior is 0 (undefined growth)", () => {
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe("windowSeries", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-06-12T00:00:00Z");

  it("buckets orders into daily slots, newest slot last", () => {
    const s = windowSeries(
      [
        order("completed", 100, [], "2026-06-12T00:00:00Z"), // today (slot 2)
        order("ready", 200, [], "2026-06-11T00:00:00Z"), // 1d ago (slot 1)
        order("completed", 300, [], "2026-06-10T00:00:00Z"), // 2d ago (slot 0)
      ],
      now,
      3,
      DAY,
    );
    expect(s).toHaveLength(3);
    expect(s[2]).toEqual({ t: now, orders: 1, revenue_cents: 100 });
    expect(s[1]).toEqual({ t: now - DAY, orders: 1, revenue_cents: 200 });
    expect(s[0]).toEqual({ t: now - 2 * DAY, orders: 1, revenue_cents: 300 });
  });

  it("stamps each bucket with its right-edge instant, ascending to now", () => {
    const s = windowSeries([], now, 3, DAY);
    expect(s.map((p) => p.t)).toEqual([now - 2 * DAY, now - DAY, now]);
  });

  it("ignores orders outside the window and cancelled orders", () => {
    const s = windowSeries(
      [
        order("completed", 100, [], "2026-06-12T00:00:00Z"),
        order("cancelled", 999, [], "2026-06-12T00:00:00Z"),
        order("completed", 500, [], "2026-06-01T00:00:00Z"), // 11d ago, out
      ],
      now,
      3,
      DAY,
    );
    expect(s[2]).toEqual({ t: now, orders: 1, revenue_cents: 100 });
    expect(s.reduce((n, p) => n + p.orders, 0)).toBe(1);
  });

  it("skips orders with an unparseable created_at", () => {
    const s = windowSeries(
      [
        order("completed", 100, [], "not-a-timestamp"),
        order("completed", 200, [], "2026-06-12T00:00:00Z"),
      ],
      now,
      3,
      DAY,
    );
    expect(s.reduce((n, p) => n + p.orders, 0)).toBe(1);
    expect(s[2]).toEqual({ t: now, orders: 1, revenue_cents: 200 });
  });
});

describe("computeStats — fulfilment + cancelled", () => {
  it("counts cancelled and rates fulfilment = completed / (completed + cancelled)", () => {
    const s = computeStats([
      order("completed", 100),
      order("completed", 100),
      order("ready", 100), // in-flight: not completed, not cancelled
      order("cancelled", 100),
    ]);
    expect(s.cancelled).toBe(1);
    // 2 completed / (2 completed + 1 cancelled) = 0.666…
    expect(s.fulfilmentRate).toBeCloseTo(2 / 3);
  });

  it("fulfilment rate is 0 when nothing completed or cancelled", () => {
    const s = computeStats([order("preparing", 100), order("ready", 100)]);
    expect(s.fulfilmentRate).toBe(0);
    expect(s.cancelled).toBe(0);
  });
});

describe("computeStats — day×hour matrix", () => {
  it("is 7×24 and buckets by SGT weekday (row 0 = Mon) and hour", () => {
    // 2026-06-12T04:00:00Z = Fri 12:00 SGT; 2026-06-08T01:00:00Z = Mon 09:00 SGT.
    const s = computeStats([
      order("completed", 100, [], "2026-06-12T04:00:00Z"),
      order("ready", 100, [], "2026-06-12T04:30:00Z"),
      order("completed", 100, [], "2026-06-08T01:00:00Z"),
    ]);
    expect(s.dayHour).toHaveLength(7);
    expect(s.dayHour[0]).toHaveLength(24);
    expect(s.dayHour[4][12]).toBe(2); // Fri 12:00
    expect(s.dayHour[0][9]).toBe(1); // Mon 09:00
    expect(s.dayHour[2][3]).toBe(0); // untouched cell
  });
});

describe("computeStats — option breakdown", () => {
  it("counts selected choices weighted by quantity, ranked desc", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          quantity: 3,
          options: [{ group: "Temperature", choice: "Iced" }],
        },
        {
          menuItemId: "k",
          name: "Kopi",
          quantity: 1,
          options: [{ group: "Temperature", choice: "Hot" }],
        },
      ]),
    ]);
    expect(s.optionBreakdown[0]).toEqual({
      group: "Temperature",
      choice: "Iced",
      count: 3,
    });
    expect(s.optionBreakdown).toContainEqual({
      group: "Temperature",
      choice: "Hot",
      count: 1,
    });
  });

  it("respects the topN limit on the option breakdown", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      menuItemId: `m${i}`,
      name: `Item ${i}`,
      quantity: i + 1,
      options: [{ group: "G", choice: `c${i}` }],
    }));
    const s = computeStats([order("completed", 0, items)], 3);
    expect(s.optionBreakdown).toHaveLength(3); // 5 distinct choices, sliced to 3
  });
});

describe("computeStats — margins", () => {
  it("is null when no item carries a cost", () => {
    const s = computeStats([
      order("completed", 140, [
        { menuItemId: "k", name: "Kopi", price_cents: 140, quantity: 1 },
      ]),
    ]);
    expect(s.grossMargin).toBeNull();
    expect(s.topItems[0].cost_cents).toBe(0);
  });

  // The margin guard keys on cost being PRESENT, not > 0: an explicit
  // cost_cents:0 is a real (zero) cost and surfaces a 100% margin. This is why
  // place_order must OMIT cost_cents for a no-cost item rather than write 0.
  it("treats an explicit cost_cents:0 as a real cost (margin surfaces)", () => {
    const s = computeStats([
      order("completed", 200, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 200,
          cost_cents: 0,
          quantity: 1,
        },
      ]),
    ]);
    expect(s.grossMargin).not.toBeNull();
    expect(s.grossMargin!.marginPct).toBe(100);
  });

  it("computes profit + margin from snapshotted costs", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 200,
          cost_cents: 50,
          quantity: 2,
        },
        {
          menuItemId: "t",
          name: "Teh",
          price_cents: 100,
          cost_cents: 40,
          quantity: 1,
        },
      ]),
    ]);
    // revenue = 200*2 + 100 = 500; cost = 50*2 + 40 = 140; profit = 360.
    expect(s.grossMargin).toEqual({
      revenue_cents: 500,
      cost_cents: 140,
      profit_cents: 360,
      marginPct: (360 / 500) * 100,
    });
    const kopi = s.topItems.find((t) => t.label === "Kopi")!;
    expect(kopi.profit_cents).toBe(300); // 400 - 100
  });

  it("treats a missing cost on one item as 0 (still surfaces margin)", () => {
    const s = computeStats([
      order("completed", 0, [
        {
          menuItemId: "k",
          name: "Kopi",
          price_cents: 200,
          cost_cents: 50,
          quantity: 1,
        },
        { menuItemId: "w", name: "Water", price_cents: 0, quantity: 1 },
      ]),
    ]);
    expect(s.grossMargin).not.toBeNull();
    expect(s.grossMargin!.cost_cents).toBe(50);
    expect(s.grossMargin!.revenue_cents).toBe(200);
  });
});

describe("computeStats — refunds", () => {
  const at = "2026-06-12T04:00:00Z";
  it("counts a confirmed-paid cancelled order as a refund, not revenue", () => {
    const s = computeStats([
      {
        status: "completed",
        total_cents: 500,
        items: [],
        created_at: at,
        payment_status: "confirmed",
      },
      {
        status: "cancelled",
        total_cents: 300,
        items: [],
        created_at: at,
        payment_status: "confirmed",
      },
      // An unpaid cancellation is NOT a refund — no money changed hands.
      {
        status: "cancelled",
        total_cents: 200,
        items: [],
        created_at: at,
        payment_status: "pending",
      },
    ]);
    expect(s.revenue_cents).toBe(500); // cancelled excluded from revenue
    expect(s.refunds_cents).toBe(300); // only the paid-then-cancelled one
    expect(s.refundCount).toBe(1);
    expect(s.cancelled).toBe(2); // both cancellations still counted
  });

  it("reports zero refunds when nothing paid was cancelled", () => {
    const s = computeStats([order("completed", 500)]);
    expect(s.refunds_cents).toBe(0);
    expect(s.refundCount).toBe(0);
  });
});

function waitOrder(
  created_at: string,
  ready_at: string | null,
  status: StatsOrder["status"] = "completed",
): StatsOrder {
  return { status, total_cents: 500, items: [], created_at, ready_at };
}

describe("avgWaitSeconds", () => {
  it("returns null when no order has a ready_at", () => {
    expect(
      avgWaitSeconds([waitOrder("2026-06-12T04:00:00Z", null)]),
    ).toBeNull();
    expect(avgWaitSeconds([])).toBeNull();
  });

  it("averages ready_at - created_at in seconds, ignoring un-readied orders", () => {
    const orders = [
      waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:02:00Z"), // 120s
      waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:08:00Z"), // 480s
      waitOrder("2026-06-12T04:00:00Z", null), // excluded
    ];
    expect(avgWaitSeconds(orders)).toBe(300); // (120+480)/2
  });

  it("excludes cancelled and guards negative (clock-skew) intervals", () => {
    const orders = [
      waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:02:00Z", "cancelled"),
      waitOrder("2026-06-12T04:05:00Z", "2026-06-12T04:00:00Z"), // negative → skip
    ];
    expect(avgWaitSeconds(orders)).toBeNull();
  });

  it("returns null for an unparseable ready_at (not a wait of 0)", () => {
    expect(
      avgWaitSeconds([waitOrder("2026-06-12T04:00:00Z", "not-a-date")]),
    ).toBeNull();
  });
});

function readiedOrders(n: number, waitSeconds: number): StatsOrder[] {
  return Array.from({ length: n }, () =>
    waitOrder(
      "2026-06-12T04:00:00Z",
      new Date(
        Date.parse("2026-06-12T04:00:00Z") + waitSeconds * 1000,
      ).toISOString(),
    ),
  );
}

function ordersWithWaits(waits: number[]): StatsOrder[] {
  return waits.map((w) => readiedOrders(1, w)[0]!);
}

describe("typicalPrepSeconds", () => {
  it("returns null when no order has a usable wait", () => {
    expect(typicalPrepSeconds([])).toBeNull();
    expect(
      typicalPrepSeconds([waitOrder("2026-06-12T04:00:00Z", null)]),
    ).toBeNull();
  });

  it("takes the median, so one slow order does not drag the estimate", () => {
    expect(typicalPrepSeconds(ordersWithWaits([60, 120, 3000]))).toBe(120);
  });

  it("averages the two middle waits for an even count", () => {
    expect(typicalPrepSeconds(ordersWithWaits([60, 120, 180, 240]))).toBe(150);
  });

  it("sorts numerically, not as strings", () => {
    expect(typicalPrepSeconds(ordersWithWaits([900, 80, 100]))).toBe(100);
  });

  it("ignores waits over an hour as abandoned", () => {
    expect(MAX_PREP_WAIT_SECONDS).toBe(3600);
    expect(
      typicalPrepSeconds(ordersWithWaits([120, 3601, 36_000, 36_000])),
    ).toBe(120);
    expect(typicalPrepSeconds(ordersWithWaits([3600]))).toBe(3600);
    expect(typicalPrepSeconds(ordersWithWaits([3601]))).toBeNull();
  });

  it("ignores cancelled orders", () => {
    expect(
      typicalPrepSeconds([
        waitOrder("2026-06-12T04:00:00Z", "2026-06-12T04:02:00Z", "cancelled"),
      ]),
    ).toBeNull();
  });
});

describe("estimateWaitSeconds", () => {
  it("uses the median and drops abandoned waits", () => {
    const orders = ordersWithWaits([
      ...Array.from({ length: 10 }, () => 120),
      37_440,
      37_440,
    ]);
    expect(estimateWaitSeconds(orders, 2)).toBe(240);
  });

  it("counts only usable waits towards the sample size", () => {
    const orders = ordersWithWaits([
      ...Array.from({ length: 9 }, () => 120),
      36_000,
    ]);
    expect(estimateWaitSeconds(orders, 2)).toBeNull();
    expect(estimateWaitSeconds(orders, 2, 10, 300)).toBe(600);
  });

  it("returns null below the minimum sample size (default 10)", () => {
    expect(estimateWaitSeconds(readiedOrders(9, 120), 2)).toBeNull();
  });

  it("multiplies the recent average wait by orders ahead once sample size is met", () => {
    expect(estimateWaitSeconds(readiedOrders(10, 120), 3)).toBe(360);
  });

  it("returns null when the recent orders have no usable wait data", () => {
    const orders = Array.from({ length: 10 }, () =>
      waitOrder("2026-06-12T04:00:00Z", null),
    );
    expect(estimateWaitSeconds(orders, 2)).toBeNull();
  });

  it("returns 0 for the next order in line (nothing ahead)", () => {
    expect(estimateWaitSeconds(readiedOrders(10, 120), 0)).toBe(0);
  });

  it("respects a custom minimum sample size", () => {
    expect(estimateWaitSeconds(readiedOrders(3, 120), 2, 3)).toBe(240);
    expect(estimateWaitSeconds(readiedOrders(2, 120), 2, 3)).toBeNull();
  });

  it("falls back to the vendor-set average below the sample size", () => {
    // 2 orders ahead * 8min (480s) fallback = 960s, ignoring the too-small
    // real sample entirely (its own 120s-per-order average is never used).
    expect(estimateWaitSeconds(readiedOrders(9, 120), 2, 10, 480)).toBe(960);
  });

  it("ignores the fallback once the real sample size is met", () => {
    // 10 readied orders meets the default minSample — the real average (120s)
    // wins over the fallback (480s) even though both are supplied.
    expect(estimateWaitSeconds(readiedOrders(10, 120), 3, 10, 480)).toBe(360);
  });

  it("still returns null below the sample size when no fallback is configured", () => {
    expect(estimateWaitSeconds(readiedOrders(9, 120), 2, 10, null)).toBeNull();
  });
});

describe("currentPrepEstimate", () => {
  it("returns null avgMinutes and the raw count below the minimum sample size", () => {
    expect(currentPrepEstimate(readiedOrders(9, 120))).toEqual({
      avgMinutes: null,
      sampleCount: 9,
      minSample: 10,
    });
  });

  it("returns the recent average in minutes once sample size is met", () => {
    expect(currentPrepEstimate(readiedOrders(10, 120))).toEqual({
      avgMinutes: 2,
      sampleCount: 10,
      minSample: 10,
    });
  });

  it("respects a custom minimum sample size", () => {
    expect(currentPrepEstimate(readiedOrders(3, 120), 3)).toEqual({
      avgMinutes: 2,
      sampleCount: 3,
      minSample: 3,
    });
  });

  it("does not count orders without a usable wait towards the sample", () => {
    const orders = Array.from({ length: 10 }, () =>
      waitOrder("2026-06-12T04:00:00Z", null),
    );
    expect(currentPrepEstimate(orders)).toEqual({
      avgMinutes: null,
      sampleCount: 0,
      minSample: 10,
    });
  });

  it("reports the median in minutes, ignoring orders left ready for hours", () => {
    // The 2026-10-16 report: test orders left sitting pushed a plain mean
    // to "~624 min per order".
    const orders = ordersWithWaits([
      ...Array.from({ length: 10 }, () => 180),
      ...Array.from({ length: 8 }, () => 37_440),
    ]);
    expect(currentPrepEstimate(orders)).toEqual({
      avgMinutes: 3,
      sampleCount: 10,
      minSample: 10,
    });
  });
});

describe("waitSeries", () => {
  it("buckets avg wait + order volume, null wait for buckets with no readied order", () => {
    const now = Date.parse("2026-06-12T04:00:00Z");
    const hour = 3_600_000;
    const orders = [
      waitOrder("2026-06-12T03:30:00Z", "2026-06-12T03:33:00Z"), // this bucket, 180s
      waitOrder("2026-06-12T03:40:00Z", null), // this bucket, counts volume only
      waitOrder("2026-06-12T02:30:00Z", null), // prior bucket, volume only
    ];
    const s = waitSeries(orders, now, 2, hour);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ t: now - hour, avgWaitSeconds: null, orders: 1 });
    expect(s[1]).toEqual({ t: now, avgWaitSeconds: 180, orders: 2 });
  });

  it("excludes cancelled orders from volume and wait", () => {
    const now = Date.parse("2026-06-12T04:00:00Z");
    const hour = 3_600_000;
    const orders = [
      waitOrder("2026-06-12T03:50:00Z", "2026-06-12T03:52:00Z", "cancelled"),
      waitOrder("2026-06-12T03:55:00Z", null),
    ];
    const s = waitSeries(orders, now, 1, hour);
    expect(s[0]).toEqual({ t: now, avgWaitSeconds: null, orders: 1 });
  });

  it("skips orders with an unparseable created_at", () => {
    const now = Date.parse("2026-06-12T04:00:00Z");
    const hour = 3_600_000;
    const orders = [
      waitOrder("garbage", "2026-06-12T03:33:00Z"),
      waitOrder("2026-06-12T03:30:00Z", "2026-06-12T03:33:00Z"), // 180s
    ];
    const s = waitSeries(orders, now, 1, hour);
    expect(s[0]).toEqual({ t: now, avgWaitSeconds: 180, orders: 1 });
  });
});

describe("peakThroughput", () => {
  it("returns the busiest single clock-hour's order count", () => {
    const orders = [
      waitOrder("2026-06-12T04:05:00Z", null),
      waitOrder("2026-06-12T04:50:00Z", null),
      waitOrder("2026-06-12T06:10:00Z", null), // different hour
    ];
    expect(peakThroughput(orders)).toBe(2);
  });

  it("returns 0 for no orders", () => {
    expect(peakThroughput([])).toBe(0);
  });

  it("returns 0 when every order is cancelled", () => {
    expect(
      peakThroughput([
        waitOrder("2026-06-12T04:05:00Z", null, "cancelled"),
        waitOrder("2026-06-12T04:50:00Z", null, "cancelled"),
      ]),
    ).toBe(0);
  });

  it("skips orders with an unparseable created_at", () => {
    expect(
      peakThroughput([
        waitOrder("not-a-date", null),
        waitOrder("2026-06-12T04:05:00Z", null),
      ]),
    ).toBe(1);
  });
});
