import { describe, expect, it } from "vitest";
import { servableBoothIds, isBoothPaused } from "./access";
import { ENTITLEMENTS } from "../plan.fixtures";

const b = (id: string, is_active: boolean, created_at: string) => ({
  id,
  is_active,
  created_at,
});

const booths = [
  b("c", true, "2026-03-01T00:00:00Z"),
  b("a", true, "2026-01-01T00:00:00Z"), // oldest active
  b("b", false, "2026-02-01T00:00:00Z"), // inactive
  b("d", true, "2026-04-01T00:00:00Z"),
];

describe("servableBoothIds", () => {
  it("free: only the oldest active booth serves", () => {
    const s = servableBoothIds(booths, ENTITLEMENTS.free);
    expect(s).toEqual(new Set(["a"]));
  });

  it("pass/pro: every active booth serves, inactive never", () => {
    const pass = servableBoothIds(booths, ENTITLEMENTS.qkit);
    expect(pass).toEqual(new Set(["a", "c", "d"]));
    expect(pass.has("b")).toBe(false);
  });

  it("free with a single active booth serves it", () => {
    const s = servableBoothIds(
      [b("x", true, "2026-01-01T00:00:00Z")],
      ENTITLEMENTS.free,
    );
    expect(s).toEqual(new Set(["x"]));
  });

  it("no active booths → empty", () => {
    expect(
      servableBoothIds(
        [b("x", false, "2026-01-01T00:00:00Z")],
        ENTITLEMENTS.free,
      ).size,
    ).toBe(0);
  });
});

describe("isBoothPaused", () => {
  it("active-but-unservable is paused; servable + inactive are not", () => {
    // only booth "a" is servable on the free plan
    const servable = servableBoothIds(booths, ENTITLEMENTS.free);
    expect(isBoothPaused(b("c", true, "2026-03-01T00:00:00Z"), servable)).toBe(
      true,
    );
    expect(isBoothPaused(b("a", true, "2026-01-01T00:00:00Z"), servable)).toBe(
      false,
    );
    expect(isBoothPaused(b("b", false, "2026-02-01T00:00:00Z"), servable)).toBe(
      false,
    );
  });
});
