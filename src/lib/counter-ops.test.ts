import { describe, expect, it, vi } from "vitest";
import { orderHasCounterOps, vendorHasCounterOps } from "./counter-ops";

type Client = Parameters<typeof vendorHasCounterOps>[0];

const NOW = Date.parse("2026-11-03T00:00:00Z");

function entitlementClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve(result) }),
      }),
    }),
  } as unknown as Client;
}

const row = (over: Record<string, unknown> = {}) => ({
  tier: "free",
  founder: false,
  stats_window: "24h",
  event_pass_starts_at: null,
  event_pass_ends_at: null,
  valid_until: null,
  ...over,
});

describe("vendorHasCounterOps", () => {
  it("is false with no cached entitlement", async () => {
    const c = entitlementClient({ data: null, error: null });
    expect(await vendorHasCounterOps(c, "v", NOW)).toBe(false);
  });

  it("is false on free and starter, true on qkit", async () => {
    for (const [tier, expected] of [
      ["free", false],
      ["starter", false],
      ["qkit", true],
    ] as const) {
      const c = entitlementClient({ data: row({ tier }), error: null });
      expect(await vendorHasCounterOps(c, "v", NOW)).toBe(expected);
    }
  });

  it("is true during a running Event Pass only", async () => {
    const pass = (start: number, end: number) =>
      entitlementClient({
        data: row({
          event_pass_starts_at: new Date(NOW + start).toISOString(),
          event_pass_ends_at: new Date(NOW + end).toISOString(),
        }),
        error: null,
      });
    expect(await vendorHasCounterOps(pass(-1000, 1000), "v", NOW)).toBe(true);
    expect(await vendorHasCounterOps(pass(1000, 2000), "v", NOW)).toBe(false);
    expect(await vendorHasCounterOps(pass(-2000, -1000), "v", NOW)).toBe(false);
  });

  it("is false once a qkit tier has lapsed", async () => {
    const c = entitlementClient({
      data: row({
        tier: "qkit",
        valid_until: new Date(NOW - 1000).toISOString(),
      }),
      error: null,
    });
    expect(await vendorHasCounterOps(c, "v", NOW)).toBe(false);
  });

  it("fails closed and logs when the read errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = entitlementClient({ data: null, error: { message: "down" } });
    expect(await vendorHasCounterOps(c, "v", NOW)).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("orderHasCounterOps", () => {
  function chain(tables: Record<string, { data: unknown; error?: unknown }>) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ error: null, ...tables[table] }),
          }),
        }),
      }),
    } as unknown as Client;
  }

  it("resolves order to booth to vendor entitlement", async () => {
    const c = chain({
      orders: { data: { booth_id: "b" } },
      booths: { data: { vendor_id: "v" } },
      vendor_entitlements: { data: row({ tier: "qkit" }) },
    });
    expect(await orderHasCounterOps(c, "o")).toBe(true);
  });

  it("is false for an unknown order or booth", async () => {
    expect(
      await orderHasCounterOps(chain({ orders: { data: null } }), "o"),
    ).toBe(false);
    expect(
      await orderHasCounterOps(
        chain({ orders: { data: { booth_id: "b" } }, booths: { data: null } }),
        "o",
      ),
    ).toBe(false);
  });
});
