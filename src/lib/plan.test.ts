import { describe, expect, it } from "vitest";
import {
  canAddBooth,
  canAddMenuItem,
  canHaveOptionGroups,
  resolveEntitlement,
  storedFromRow,
  isStatsRange,
  type StoredEntitlement,
} from "./plan";

const NOW = Date.parse("2026-06-18T12:00:00Z");
const hour = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function stored(over: Partial<StoredEntitlement> = {}): StoredEntitlement {
  return {
    tier: "free",
    founder: false,
    statsWindow: "24h",
    eventPassStartsAt: null,
    eventPassEndsAt: null,
    validUntil: null,
    ...over,
  };
}

describe("resolveEntitlement: tier", () => {
  it("no pushed entitlement is free", () => {
    const ent = resolveEntitlement(null, NOW);
    expect(ent.tier).toBe("free");
    expect(ent.founder).toBe(false);
    expect(ent.eventPass).toBeNull();
  });

  it("a stored tier with no expiry holds", () => {
    expect(resolveEntitlement(stored({ tier: "starter" }), NOW).tier).toBe(
      "starter",
    );
  });

  it("a stored tier holds until valid_until, then lapses to free", () => {
    const live = stored({ tier: "qkit", validUntil: at(hour) });
    expect(resolveEntitlement(live, NOW).tier).toBe("qkit");
    const lapsed = stored({ tier: "qkit", validUntil: at(-hour) });
    expect(resolveEntitlement(lapsed, NOW).tier).toBe("free");
  });

  it("valid_until == now is lapsed (half-open)", () => {
    const edge = stored({ tier: "qkit", validUntil: at(0) });
    expect(resolveEntitlement(edge, NOW).tier).toBe("free");
  });

  it("a lapsed tier also loses its 90d stats window", () => {
    const lapsed = stored({
      tier: "qkit",
      statsWindow: "90d",
      validUntil: at(-hour),
    });
    expect(resolveEntitlement(lapsed, NOW).statsRanges).toEqual(["24h"]);
  });

  it("carries the founder flag", () => {
    expect(resolveEntitlement(stored({ founder: true }), NOW).founder).toBe(
      true,
    );
  });
});

describe("resolveEntitlement: caps", () => {
  it("free: one booth, six items, three option groups, no extras", () => {
    const ent = resolveEntitlement(null, NOW);
    expect(ent).toMatchObject({
      maxBooths: 1,
      maxMenuItems: 6,
      maxOptionGroupsPerItem: 3,
      autoCloseHours: false,
      stockCaps: false,
      counterOps: false,
      statsRanges: ["24h"],
      statsSince: null,
    });
  });

  it("starter: one booth, unlimited items, auto-close and stock caps, no counter ops", () => {
    const ent = resolveEntitlement(stored({ tier: "starter" }), NOW);
    expect(ent).toMatchObject({
      maxBooths: 1,
      maxMenuItems: null,
      maxOptionGroupsPerItem: null,
      autoCloseHours: true,
      stockCaps: true,
      counterOps: false,
      statsRanges: ["24h"],
    });
  });

  it("qkit: unlimited booths, counter ops, stats per stats_window", () => {
    const ninety = resolveEntitlement(
      stored({ tier: "qkit", statsWindow: "90d" }),
      NOW,
    );
    expect(ninety).toMatchObject({
      maxBooths: null,
      counterOps: true,
      statsRanges: ["24h", "7d", "30d", "90d"],
      statsSince: null,
    });
    const short = resolveEntitlement(
      stored({ tier: "qkit", statsWindow: "24h" }),
      NOW,
    );
    expect(short.statsRanges).toEqual(["24h"]);
  });
});

describe("resolveEntitlement: event pass", () => {
  it("a running pass grants qkit capability and floors stats at its start", () => {
    const startsAt = at(-hour);
    const ent = resolveEntitlement(
      stored({ eventPassStartsAt: startsAt, eventPassEndsAt: at(hour) }),
      NOW,
    );
    expect(ent.tier).toBe("free");
    expect(ent.eventPass).toEqual({
      startsAt,
      endsAt: at(hour),
      running: true,
    });
    expect(ent).toMatchObject({
      maxBooths: null,
      maxMenuItems: null,
      counterOps: true,
      statsRanges: ["24h", "7d", "30d", "90d"],
      statsSince: startsAt,
    });
  });

  it("a scheduled pass is reported but grants nothing yet", () => {
    const ent = resolveEntitlement(
      stored({ eventPassStartsAt: at(hour), eventPassEndsAt: at(2 * hour) }),
      NOW,
    );
    expect(ent.eventPass?.running).toBe(false);
    expect(ent.counterOps).toBe(false);
    expect(ent.maxBooths).toBe(1);
  });

  it("an ended pass is dropped; ends_at == now is ended", () => {
    const past = resolveEntitlement(
      stored({ eventPassStartsAt: at(-2 * hour), eventPassEndsAt: at(-hour) }),
      NOW,
    );
    expect(past.eventPass).toBeNull();
    const edge = resolveEntitlement(
      stored({ eventPassStartsAt: at(-hour), eventPassEndsAt: at(0) }),
      NOW,
    );
    expect(edge.eventPass).toBeNull();
  });

  it("starts_at == now is running", () => {
    const ent = resolveEntitlement(
      stored({ eventPassStartsAt: at(0), eventPassEndsAt: at(hour) }),
      NOW,
    );
    expect(ent.eventPass?.running).toBe(true);
  });

  it("a qkit tier keeps its own stats window while a pass runs", () => {
    const ent = resolveEntitlement(
      stored({
        tier: "qkit",
        statsWindow: "24h",
        eventPassStartsAt: at(-hour),
        eventPassEndsAt: at(hour),
      }),
      NOW,
    );
    expect(ent.statsSince).toBeNull();
    expect(ent.statsRanges).toEqual(["24h"]);
  });

  it("ignores unparseable pass timestamps", () => {
    const ent = resolveEntitlement(
      stored({ eventPassStartsAt: "nope", eventPassEndsAt: "nope" }),
      NOW,
    );
    expect(ent.eventPass).toBeNull();
  });
});

describe("storedFromRow", () => {
  it("maps snake_case columns to the camelCase shape", () => {
    expect(
      storedFromRow({
        tier: "starter",
        founder: true,
        stats_window: "90d",
        event_pass_starts_at: "a",
        event_pass_ends_at: "b",
        valid_until: "c",
      }),
    ).toEqual({
      tier: "starter",
      founder: true,
      statsWindow: "90d",
      eventPassStartsAt: "a",
      eventPassEndsAt: "b",
      validUntil: "c",
    });
  });
});

describe("isStatsRange", () => {
  it("accepts the four ranges only", () => {
    for (const r of ["24h", "7d", "30d", "90d"]) {
      expect(isStatsRange(r)).toBe(true);
    }
    expect(isStatsRange("1y")).toBe(false);
    expect(isStatsRange(undefined)).toBe(false);
  });
});

describe("cap helpers", () => {
  const free = resolveEntitlement(null, NOW);
  const unlimited = resolveEntitlement(stored({ tier: "qkit" }), NOW);

  it("canAddBooth", () => {
    expect(canAddBooth(free, 0)).toBe(true);
    expect(canAddBooth(free, 1)).toBe(false);
    expect(canAddBooth(unlimited, 50)).toBe(true);
  });

  it("canAddMenuItem", () => {
    expect(canAddMenuItem(free, 5)).toBe(true);
    expect(canAddMenuItem(free, 6)).toBe(false);
    expect(canAddMenuItem(unlimited, 500)).toBe(true);
  });

  it("canHaveOptionGroups", () => {
    expect(canHaveOptionGroups(free, 3)).toBe(true);
    expect(canHaveOptionGroups(free, 4)).toBe(false);
    expect(canHaveOptionGroups(unlimited, 40)).toBe(true);
  });
});
