// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { gate, list, ownBooths, gte, lt } = vi.hoisted(() => ({
  gate: vi.fn(),
  list: vi.fn(),
  ownBooths: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({
  requireEntitledVendor: gate,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gte: (...args: unknown[]) => {
          gte(...args);
          return chain;
        },
        lt: (...args: unknown[]) => {
          lt(...args);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        then: <T,>(resolve: (value: unknown) => T) =>
          Promise.resolve(
            table === "booths"
              ? { data: [{ id: "a", name: "Coffee" }], error: null }
              : {
                  data: lt.mock.calls.length ? [{ id: "old" }] : [],
                  error: null,
                },
          ).then(resolve),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/own-booth-numbering", () => ({
  numberingStateForOwnBooths: ownBooths,
}));
vi.mock("./completed-orders-list", () => ({
  CompletedOrdersList: (props: unknown) => {
    list(props);
    return null;
  },
}));
import CompletedOrdersPage from "./page";
import { ENTITLEMENTS } from "@/lib/plan.fixtures";

function signIn(tier: "free" | "starter" | "qkit") {
  gate.mockResolvedValue({
    vendor: {
      id: "vendor-a",
      board_settings: { daily_order_number_reset: true },
    },
    entitlement: ENTITLEMENTS[tier],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  signIn("free");
});

describe("CompletedOrdersPage history window", () => {
  beforeEach(() => {
    ownBooths.mockResolvedValue({ baselines: {}, starts: {} });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-12T05:00:00Z"));
  });

  it("limits Free and Starter to 00:00 SGT yesterday in the query", async () => {
    for (const tier of ["free", "starter"] as const) {
      gte.mockClear();
      signIn(tier);
      render(await CompletedOrdersPage());
      expect(gte).toHaveBeenCalledWith(
        "completed_at",
        "2026-06-10T16:00:00.000Z",
      );
    }
  });

  it("leaves Pro unfiltered", async () => {
    signIn("qkit");
    render(await CompletedOrdersPage());
    expect(gte).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ olderHidden: false }),
    );
  });

  it("flags hidden older orders for the note", async () => {
    render(await CompletedOrdersPage());
    expect(lt).toHaveBeenCalledWith("completed_at", "2026-06-10T16:00:00.000Z");
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ olderHidden: true }),
    );
  });
});

describe("CompletedOrdersPage numbering", () => {
  it("ranks from the service-client baselines for the vendor's own booth ids", async () => {
    const baselines = {
      a: {
        day: "0023",
        services: [
          { start: "2026-11-03T11:00:34.000Z", baseline: "0023" },
          { start: "2026-11-03T11:01:20.000Z", baseline: "0024" },
          { start: "2026-11-03T11:01:54.000Z", baseline: "0025" },
        ],
      },
    };
    ownBooths.mockResolvedValue({ baselines, starts: {} });
    render(await CompletedOrdersPage());
    expect(ownBooths).toHaveBeenCalledWith(["a"]);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ dailyOrderNumberBaselines: baselines }),
    );
    expect(screen.queryByText(/Order numbers may be off/)).toBeNull();
  });

  it("warns when the numbering read was degraded", async () => {
    ownBooths.mockResolvedValue({ baselines: {}, starts: {}, degraded: true });
    render(await CompletedOrdersPage());
    expect(screen.getByRole("alert").textContent).toBe(
      "Order numbers may be off. Refresh to retry.",
    );
  });
});
