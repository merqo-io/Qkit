import { describe, it, expect } from "vitest";
import { computeMerqoMetrics } from "@/lib/merqo/metrics";

const DAY = 24 * 60 * 60 * 1000;

describe("computeMerqoMetrics", () => {
  const now = Date.UTC(2026, 6, 4);
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  it("aggregates revenue, gmv, orders delta, signups, funnel", () => {
    const m = computeMerqoMetrics({
      nowMs: now,
      vendors: [
        { id: "v1", paid: true, created_at: iso(2) },
        { id: "v2", paid: false, created_at: iso(3) },
        { id: "v3", paid: false, created_at: iso(40) },
      ],
      booths: [
        { id: "b1", vendor_id: "v1" },
        { id: "b2", vendor_id: "v2" },
      ],
      orders: [
        {
          booth_id: "b1",
          status: "paid",
          total_cents: 1000,
          created_at: iso(1),
        },
        {
          booth_id: "b1",
          status: "cancelled",
          total_cents: 5000,
          created_at: iso(1),
        },
        {
          booth_id: "b2",
          status: "paid",
          total_cents: 2000,
          created_at: iso(10),
        },
      ],
      payments: [
        { amount_cents: 900, created_at: iso(2) },
        { amount_cents: 100, created_at: iso(45) },
      ],
    });

    expect(m.revenue_cents_30d).toBe(900);
    expect(m.revenue_cents_all).toBe(1000);
    expect(m.gmv_cents_30d).toBe(3000); // both paid within 30d, cancelled excluded
    expect(m.orders_7d).toBe(2); // both 1d orders (paid + cancelled) count as orders
    expect(m.orders_prev_7d).toBe(1); // the 10d order falls in the 7-14d prior window
    expect(m.signups_7d).toBe(2); // v1, v2
    expect(m.total_vendors).toBe(3);
    expect(m.pro_vendors).toBe(1);
    expect(m.active_vendors).toBe(2); // v1, v2 each have an order
    expect(m.pending_upgrade_requests).toBe(0);
    expect(m.funnel).toEqual({
      signed_up: 3,
      with_booth: 2,
      with_order: 2,
      pro: 1,
    });
  });

  it("excludes cancelled from gmv but still counts it as an order in the window", () => {
    const m = computeMerqoMetrics({
      nowMs: now,
      vendors: [{ id: "v1", paid: false, created_at: iso(1) }],
      booths: [{ id: "b1", vendor_id: "v1" }],
      orders: [
        {
          booth_id: "b1",
          status: "cancelled",
          total_cents: 500,
          created_at: iso(1),
        },
      ],
      payments: [],
    });
    expect(m.gmv_cents_30d).toBe(0);
    expect(m.orders_7d).toBe(1);
  });
});
