import { describe, it, expect } from "vitest";
import { resolveVendorStatus } from "./vendor-status";
import type { Tier } from "@/lib/plan";

const authUsers = [
  { id: "u1", email: "alice@example.com" },
  { id: "u2", email: "BOB@Example.com" },
];
const vendors = [{ id: "u1" }];
const tiers: Record<string, Tier> = { u1: "qkit", u2: "starter" };
const tierOf = (id: string): Tier => tiers[id] ?? "free";

describe("resolveVendorStatus", () => {
  it("active + effective tier when the email's auth user has a vendors row", () => {
    const r = resolveVendorStatus(
      "alice@example.com",
      authUsers,
      vendors,
      tierOf,
    );
    expect(r).toEqual({ active: true, plan: "qkit" });
  });

  it("matches email case-insensitively", () => {
    const r = resolveVendorStatus(
      "bob@example.com",
      authUsers,
      [{ id: "u2" }],
      tierOf,
    );
    expect(r).toEqual({ active: true, plan: "starter" });
  });

  it("reports free when the cache has no row for the vendor", () => {
    const r = resolveVendorStatus(
      "alice@example.com",
      authUsers,
      vendors,
      () => "free",
    );
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("inactive when no auth user matches the email", () => {
    const r = resolveVendorStatus(
      "nobody@example.com",
      authUsers,
      vendors,
      tierOf,
    );
    expect(r).toEqual({ active: false, plan: null });
  });

  it("inactive when the auth user exists but has no vendors row", () => {
    const r = resolveVendorStatus(
      "bob@example.com",
      authUsers,
      vendors,
      tierOf,
    );
    expect(r).toEqual({ active: false, plan: null });
  });
});
