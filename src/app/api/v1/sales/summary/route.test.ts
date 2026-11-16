import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENTITLEMENTS } from "@/lib/plan.fixtures";

const { load, fetchOrders } = vi.hoisted(() => ({
  load: vi.fn(),
  fetchOrders: vi.fn(),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({ loadEntitlement: load }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => true }));
vi.mock("@/app/dashboard/stats/queries", () => ({ fetchOrders }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [{ id: "a" }], error: null }),
      }),
    }),
  }),
}));
import { GET } from "./route";

function signIn(tier: "free" | "starter" | "qkit") {
  load.mockResolvedValue({
    user: { id: "u" },
    vendor: { id: "v" },
    entitlement: ENTITLEMENTS[tier],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchOrders.mockResolvedValue([]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-12T05:00:00Z"));
});

describe("GET /api/v1/sales/summary window", () => {
  it("starts Free and Starter at 00:00 SGT yesterday whatever range is asked", async () => {
    for (const tier of ["free", "starter"] as const) {
      signIn(tier);
      await GET(new Request("http://x/api/v1/sales/summary?range=90d"));
      expect(fetchOrders.mock.calls.at(-1)?.[2]).toBe(
        "2026-06-10T16:00:00.000Z",
      );
    }
  });

  it("keeps Pro on the requested rolling range", async () => {
    signIn("qkit");
    await GET(new Request("http://x/api/v1/sales/summary?range=7d"));
    expect(fetchOrders.mock.calls.at(-1)?.[2]).toBe("2026-06-05T05:00:00.000Z");
  });
});
