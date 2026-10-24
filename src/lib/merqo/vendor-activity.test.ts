import { describe, it, expect } from "vitest";
import { computeVendorActivity } from "./vendor-activity";
import { MS_PER_DAY } from "../utils";

const NOW = Date.parse("2026-08-27T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * MS_PER_DAY).toISOString();

const vendor = { id: "v1", plan: "free" as const, created_at: daysAgo(30) };

describe("computeVendorActivity", () => {
  it("aggregates orders/revenue/booths and reuses admin-vendor-health's status", () => {
    const booths = [
      { id: "b1", vendor_id: "v1", created_at: daysAgo(25), is_active: true },
      { id: "b2", vendor_id: "v1", created_at: daysAgo(20), is_active: false },
    ];
    const orders = [
      {
        booth_id: "b1",
        status: "completed",
        total_cents: 1000,
        created_at: daysAgo(1),
      },
      {
        booth_id: "b1",
        status: "completed",
        total_cents: 2000,
        created_at: daysAgo(5),
      },
      // outside the 30d window
      {
        booth_id: "b1",
        status: "completed",
        total_cents: 5000,
        created_at: daysAgo(40),
      },
      // cancelled — excluded from both revenue and health's order count
      {
        booth_id: "b1",
        status: "cancelled",
        total_cents: 9999,
        created_at: daysAgo(1),
      },
    ];

    const result = computeVendorActivity(
      vendor,
      {
        booths: booths,
        orders: orders,
        passExpiresAt: null,
        hasOpenMessage: false,
      },
      NOW,
    );

    expect(result.active).toBe(true);
    expect(result.plan).toBe("free");
    expect(result.status).toBe("healthy");
    expect(result.metrics).toEqual([
      { label: "Orders (30d)", value: "2" },
      { label: "Revenue (30d)", value: "$30.00" },
      { label: "Booths", value: "1/2" },
    ]);
    expect(result.lastActivityAt).toBe(daysAgo(1));
  });

  it("an open help request flips status to attention, matching the admin console", () => {
    const result = computeVendorActivity(
      vendor,
      { booths: [], orders: [], passExpiresAt: null, hasOpenMessage: true },
      NOW,
    );
    expect(result.status).toBe("attention");
  });

  it("a vendor with nothing yet has zeroed metrics and a null lastActivityAt", () => {
    const fresh = { id: "v2", plan: "free" as const, created_at: daysAgo(1) };
    const result = computeVendorActivity(
      fresh,
      { booths: [], orders: [], passExpiresAt: null, hasOpenMessage: false },
      NOW,
    );

    expect(result.active).toBe(true);
    expect(result.status).toBe("new");
    expect(result.metrics).toEqual([
      { label: "Orders (30d)", value: "0" },
      { label: "Revenue (30d)", value: "$0.00" },
      { label: "Booths", value: "0/0" },
    ]);
    expect(result.lastActivityAt).toBeNull();
  });

  it("a live pass expiring within 48h wins over an older healthy order history", () => {
    const result = computeVendorActivity(
      vendor,
      {
        booths: [
          {
            id: "b1",
            vendor_id: "v1",
            created_at: daysAgo(25),
            is_active: true,
          },
        ],
        orders: [
          {
            booth_id: "b1",
            status: "completed",
            total_cents: 500,
            created_at: daysAgo(1),
          },
        ],
        passExpiresAt: new Date(NOW + 10 * 3_600_000).toISOString(),
        hasOpenMessage: false,
      },
      NOW,
    );
    expect(result.status).toBe("expiring");
  });

  it("a pro vendor is reported with plan pro", () => {
    const pro = { id: "v3", plan: "pro" as const, created_at: daysAgo(10) };
    const result = computeVendorActivity(
      pro,
      { booths: [], orders: [], passExpiresAt: null, hasOpenMessage: false },
      NOW,
    );
    expect(result.plan).toBe("pro");
  });
});
