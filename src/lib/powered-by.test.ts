import { beforeEach, describe, expect, it, vi } from "vitest";

const { entitlementRow, boothRow } = vi.hoisted(() => ({
  entitlementRow: vi.fn(),
  boothRow: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            table === "booths" ? boothRow() : entitlementRow(),
        }),
      }),
    }),
  }),
}));
import { showPoweredByMerqo, showPoweredByMerqoForBooth } from "./powered-by";

const row = (over: Record<string, unknown> = {}) => ({
  tier: "free",
  founder: false,
  stats_window: "24h",
  event_pass_starts_at: null,
  event_pass_ends_at: null,
  valid_until: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  boothRow.mockResolvedValue({ data: { vendor_id: "v" }, error: null });
});

describe("showPoweredByMerqo", () => {
  it("shows for Free and for a vendor with no entitlement row", async () => {
    entitlementRow.mockResolvedValue({ data: row(), error: null });
    expect(await showPoweredByMerqo("v")).toBe(true);
    entitlementRow.mockResolvedValue({ data: null, error: null });
    expect(await showPoweredByMerqo("v")).toBe(true);
  });

  it("hides for Starter and Pro", async () => {
    entitlementRow.mockResolvedValue({
      data: row({ tier: "starter" }),
      error: null,
    });
    expect(await showPoweredByMerqo("v")).toBe(false);
    entitlementRow.mockResolvedValue({
      data: row({ tier: "qkit", stats_window: "90d" }),
      error: null,
    });
    expect(await showPoweredByMerqo("v")).toBe(false);
  });

  it("hides for a Free vendor with a running Event Pass", async () => {
    const day = 86_400_000;
    entitlementRow.mockResolvedValue({
      data: row({
        event_pass_starts_at: new Date(Date.now() - day).toISOString(),
        event_pass_ends_at: new Date(Date.now() + day).toISOString(),
      }),
      error: null,
    });
    expect(await showPoweredByMerqo("v")).toBe(false);
  });

  it("hides when the read errors or throws", async () => {
    entitlementRow.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await showPoweredByMerqo("v")).toBe(false);
    entitlementRow.mockRejectedValue(new Error("down"));
    expect(await showPoweredByMerqo("v")).toBe(false);
  });
});

describe("showPoweredByMerqoForBooth", () => {
  it("resolves the booth's vendor first", async () => {
    entitlementRow.mockResolvedValue({ data: row(), error: null });
    expect(await showPoweredByMerqoForBooth("b")).toBe(true);
  });

  it("hides when the booth cannot be read", async () => {
    boothRow.mockResolvedValue({ data: null, error: null });
    expect(await showPoweredByMerqoForBooth("b")).toBe(false);
    boothRow.mockRejectedValue(new Error("down"));
    expect(await showPoweredByMerqoForBooth("b")).toBe(false);
  });
});
