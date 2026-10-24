import { describe, expect, it } from "vitest";
import {
  buildVendorHealth,
  passHoursLeft,
  statusRank,
  vendorStatus,
  type BoothLite,
  type OrderLite,
  type VendorLite,
} from "./vendor-health";
import { MS_PER_DAY } from "../utils";

const NOW = Date.parse("2026-07-04T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * MS_PER_DAY).toISOString();
const hoursFromNow = (n: number) => new Date(NOW + n * 3_600_000).toISOString();

function signals(over: Partial<Parameters<typeof vendorStatus>[0]> = {}) {
  return {
    plan: "free" as const,
    createdAt: daysAgo(30),
    passExpiresAt: null,
    boothCount: 1,
    firstBoothAt: daysAgo(20),
    orderCount: 5,
    lastOrderAt: daysAgo(1),
    hasOpenMessage: false,
    ...over,
  };
}

describe("passHoursLeft", () => {
  it("returns null when there is no pass expiry", () => {
    expect(passHoursLeft(null, NOW)).toBeNull();
    expect(passHoursLeft(undefined, NOW)).toBeNull();
  });

  it("rounds remaining time to whole hours", () => {
    expect(passHoursLeft(hoursFromNow(5), NOW)).toBe(5);
    expect(passHoursLeft(hoursFromNow(5.4), NOW)).toBe(5);
    expect(passHoursLeft(hoursFromNow(5.6), NOW)).toBe(6);
  });

  it("floors an already-expired pass at 0 rather than going negative", () => {
    expect(passHoursLeft(hoursFromNow(-3), NOW)).toBe(0);
  });
});

describe("vendorStatus", () => {
  it("attention wins over everything when a help request is open", () => {
    expect(
      vendorStatus(signals({ hasOpenMessage: true, orderCount: 0 }), NOW),
    ).toBe("attention");
  });

  it("expiring when a live pass ends within 48h", () => {
    expect(
      vendorStatus(signals({ passExpiresAt: hoursFromNow(10) }), NOW),
    ).toBe("expiring");
  });

  it("a pass more than 48h out is not expiring", () => {
    expect(
      vendorStatus(signals({ passExpiresAt: hoursFromNow(72) }), NOW),
    ).toBe("healthy");
  });

  it("stuck: signed up 3d+ ago with no booth", () => {
    expect(
      vendorStatus(
        signals({ boothCount: 0, firstBoothAt: null, createdAt: daysAgo(5) }),
        NOW,
      ),
    ).toBe("stuck");
  });

  it("stuck: a booth 3d+ old but still no orders", () => {
    expect(
      vendorStatus(
        signals({ orderCount: 0, lastOrderAt: null, firstBoothAt: daysAgo(4) }),
        NOW,
      ),
    ).toBe("stuck");
  });

  it("stuck: Pro but zero orders ever", () => {
    expect(
      vendorStatus(
        signals({ plan: "pro", orderCount: 0, lastOrderAt: null }),
        NOW,
      ),
    ).toBe("stuck");
  });

  it("healthy: took an order within 14d", () => {
    expect(vendorStatus(signals({ lastOrderAt: daysAgo(5) }), NOW)).toBe(
      "healthy",
    );
  });

  it("new: signed up under 3d ago, no penalty yet", () => {
    expect(
      vendorStatus(
        signals({
          createdAt: daysAgo(1),
          boothCount: 0,
          firstBoothAt: null,
          orderCount: 0,
          lastOrderAt: null,
        }),
        NOW,
      ),
    ).toBe("new");
  });

  it("quiet: active before but silent past 14d", () => {
    expect(vendorStatus(signals({ lastOrderAt: daysAgo(20) }), NOW)).toBe(
      "quiet",
    );
  });
});

describe("statusRank", () => {
  it("orders most-urgent first", () => {
    expect(statusRank("attention")).toBeLessThan(statusRank("expiring"));
    expect(statusRank("expiring")).toBeLessThan(statusRank("stuck"));
    expect(statusRank("stuck")).toBeLessThan(statusRank("quiet"));
    expect(statusRank("quiet")).toBeLessThan(statusRank("new"));
    expect(statusRank("new")).toBeLessThan(statusRank("healthy"));
  });
});

describe("buildVendorHealth", () => {
  const vendors: VendorLite[] = [
    { id: "v1", plan: "free", created_at: daysAgo(30), passExpiresAt: null },
    { id: "v2", plan: "free", created_at: daysAgo(2), passExpiresAt: null },
  ];
  const booths: BoothLite[] = [
    { id: "b1", vendor_id: "v1", created_at: daysAgo(25) },
  ];
  const orders: OrderLite[] = [
    { booth_id: "b1", status: "completed", created_at: daysAgo(1) },
    { booth_id: "b1", status: "completed", created_at: daysAgo(2) },
    { booth_id: "b1", status: "cancelled", created_at: daysAgo(1) },
    { booth_id: "unknown", status: "completed", created_at: daysAgo(1) },
  ];

  it("keys orders to vendors, excludes cancelled + orphan orders", () => {
    const h = buildVendorHealth(
      {
        vendors: vendors,
        booths: booths,
        orders: orders,
        openMessageVendorIds: new Set(),
      },
      NOW,
    );
    const v1 = h.get("v1")!;
    expect(v1.orderCount).toBe(2); // cancelled + orphan excluded
    expect(v1.orders7d).toBe(2);
    expect(v1.lastOrderAt).toBe(daysAgo(1));
    expect(v1.boothCount).toBe(1);
    expect(v1.status).toBe("healthy");
  });

  it("a fresh vendor with nothing yet is new", () => {
    const h = buildVendorHealth(
      {
        vendors: vendors,
        booths: booths,
        orders: orders,
        openMessageVendorIds: new Set(),
      },
      NOW,
    );
    expect(h.get("v2")!.status).toBe("new");
  });

  it("an open message flips a vendor to attention", () => {
    const h = buildVendorHealth(
      {
        vendors: vendors,
        booths: booths,
        orders: orders,
        openMessageVendorIds: new Set(["v1"]),
      },
      NOW,
    );
    expect(h.get("v1")!.status).toBe("attention");
  });
});
