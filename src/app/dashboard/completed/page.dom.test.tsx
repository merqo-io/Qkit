// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { gate, list, ownBooths } = vi.hoisted(() => ({
  gate: vi.fn(),
  list: vi.fn(),
  ownBooths: vi.fn(),
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
        order: () => chain,
        limit: () => chain,
        then: <T,>(resolve: (value: unknown) => T) =>
          Promise.resolve(
            table === "booths"
              ? { data: [{ id: "a", name: "Coffee" }], error: null }
              : { data: [], error: null },
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

beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({
    vendor: {
      id: "vendor-a",
      board_settings: { daily_order_number_reset: true },
    },
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
