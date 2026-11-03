// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
const { gate, fixtures, from, filters, rpc, board, serviceClient } = vi.hoisted(
  () => ({
    gate: vi.fn(),
    fixtures: {} as Record<
      string,
      { data: unknown; error?: { message: string }; failFrom?: number }
    >,
    from: vi.fn(),
    filters: vi.fn(),
    rpc: vi.fn(),
    board: vi.fn(),
    serviceClient: vi.fn(),
  }),
);
vi.mock("@/lib/supabase/get-entitlement", () => ({
  requireEntitledVendor: gate,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from, rpc }),
  createServiceClient: async () => {
    serviceClient();
    return { from, rpc };
  },
}));
vi.mock("./realtime-order-board", () => ({
  RealtimeOrderBoard: (props: unknown) => {
    board(props);
    return null;
  },
}));
import DashboardPage from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({
    vendor: {
      id: "vendor-a",
      board_settings: { daily_order_number_reset: false },
    },
  });
  for (const key of Object.keys(fixtures)) delete fixtures[key];
  rpc.mockResolvedValue({ data: 3, error: null });
  from.mockImplementation((table: string) => {
    let selected = "";
    let afterId: string | null = null;
    const result = () =>
      fixtures[
        selected === "booth_id, order_number, created_at" ? "baselines" : table
      ] ?? {
        data: null,
      };
    const chain = {
      gt: (_column: string, id: string) => {
        afterId = id;
        return chain;
      },
      limit: () => {
        const current = result();
        if (
          afterId !== null &&
          "failFrom" in current &&
          current.failFrom !== undefined
        )
          return Promise.resolve({
            data: null,
            error: { message: "Late page failed" },
          });
        let data = current.data;
        if (Array.isArray(data))
          data = [...data]
            .sort((a, b) => a.id.localeCompare(b.id))
            .filter((row) => afterId === null || row.id > afterId)
            .slice(0, 2);
        else if (data === null && !current.error) data = [];
        return Promise.resolve({
          ...current,
          data,
          error: current.error ?? null,
        });
      },
      range: (from: number, to: number) => {
        const current = result();
        if (
          "failFrom" in current &&
          current.failFrom !== undefined &&
          from >= current.failFrom
        )
          return Promise.resolve({
            data: null,
            error: { message: "Late page failed" },
          });
        let data = current.data;
        if (Array.isArray(data))
          data = data.slice(from, Math.min(to + 1, from + 2));
        else if (data === null && !current.error) data = [];
        return Promise.resolve({
          ...current,
          data,
          error: current.error ?? null,
        });
      },
      select: (value: string) => {
        selected = value;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters(table, column, value);
        return chain;
      },
      in: (column: string, value: unknown) => {
        filters(table, column, value);
        return chain;
      },
      gte: (column: string, value: unknown) => {
        filters(table, column, value);
        return chain;
      },
      not: (column: string, op: string, value: string) => {
        filters(table, column, op, value);
        return chain;
      },
      order: () => chain,
      then: <T,>(resolve: (value: ReturnType<typeof result>) => T) =>
        Promise.resolve(result()).then(resolve),
    };
    return chain;
  });
});
const NOW_ISO = new Date().toISOString();
const booths = [
  { id: "a", name: "Coffee", is_active: true, hours: null, daily_cup_cap: 20 },
  { id: "b", name: "Tea", is_active: false, hours: null, daily_cup_cap: null },
];
describe("dashboard initial load", () => {
  it("bounds order filters to one hundred owned booths per request", async () => {
    const manyBooths = Array.from({ length: 101 }, (_, index) => ({
      ...booths[1],
      id: `booth-${index}`,
    }));
    fixtures.booths = { data: manyBooths };
    render(await DashboardPage());
    expect(filters).toHaveBeenCalledWith(
      "orders",
      "booth_id",
      manyBooths.slice(0, 100).map((booth) => booth.id),
    );
    expect(filters).toHaveBeenCalledWith("orders", "booth_id", ["booth-100"]);
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({ loadError: false }),
    );
  });

  it("keeps the board available when a decorative cup-count request rejects", async () => {
    fixtures.booths = { data: booths };
    rpc.mockRejectedValueOnce(new Error("offline"));
    render(await DashboardPage());
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({
        loadError: false,
        booths: expect.arrayContaining([
          expect.objectContaining({ id: "a", cups_today: 0 }),
        ]),
      }),
    );
  });
  it("loads booths and active orders beyond a two-row API cap", async () => {
    fixtures.booths = { data: [...booths, { ...booths[1], id: "c" }] };
    const orders = ["first", "second", "third"].map((id) => ({
      id,
      order_number: id,
    }));
    fixtures.orders = { data: orders };
    render(await DashboardPage());
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOrders: orders,
        booths: expect.arrayContaining([expect.objectContaining({ id: "c" })]),
        loadError: false,
      }),
    );
  });

  it("does not expose a partial queue after a late page failure", async () => {
    fixtures.booths = { data: booths };
    fixtures.orders = {
      data: [1, 2, 3].map((id) => ({
        id: String(id),
        order_number: String(id),
      })),
      failFrom: 2,
    };
    render(await DashboardPage());
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({ initialOrders: [], loadError: true }),
    );
  });
  it("requires vendor authentication before accessing data", async () => {
    gate.mockRejectedValue(new Error("Denied"));
    await expect(DashboardPage()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("avoids order and capacity queries when no booths exist", async () => {
    render(await DashboardPage());
    expect(from).not.toHaveBeenCalledWith("orders");
    expect(rpc).not.toHaveBeenCalled();
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOrders: [],
        booths: [],
        loadError: false,
      }),
    );
    expect(filters).toHaveBeenCalledWith("booths", "vendor_id", "vendor-a");
  });
  it("loads only nonterminal orders for owned booths and omits unnumbered rows", async () => {
    fixtures.booths = { data: booths };
    fixtures.orders = {
      data: [
        { id: "ready", order_number: "A002" },
        { id: "incomplete", order_number: null },
      ],
    };
    render(await DashboardPage());
    expect(filters).toHaveBeenCalledWith("orders", "booth_id", ["a", "b"]);
    expect(filters).toHaveBeenCalledWith(
      "orders",
      "status",
      "in",
      "(completed,cancelled)",
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("booth_cups_today", {
      p_booth_id: "a",
    });
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOrders: [{ id: "ready", order_number: "A002" }],
        booths: [
          expect.objectContaining({ id: "a", open: true, cups_today: 3 }),
          expect.objectContaining({ id: "b", open: false, cups_today: 0 }),
        ],
      }),
    );
  });
  it.each(["booths", "orders"])(
    "exposes %s failure instead of presenting an empty successful board",
    async (table) => {
      fixtures.booths = { data: booths };
      fixtures[table] = { data: null, error: { message: "Unavailable" } };
      render(await DashboardPage());
      expect(board).toHaveBeenCalledWith(
        expect.objectContaining({ loadError: true }),
      );
    },
  );
  it.each([
    { data: null, error: { message: "Unavailable" } },
    { data: "invalid", error: null },
  ])(
    "degrades only the decorative capacity count on failure",
    async (result) => {
      fixtures.booths = { data: booths };
      rpc.mockResolvedValue(result);
      render(await DashboardPage());
      expect(board).toHaveBeenCalledWith(
        expect.objectContaining({
          loadError: false,
          booths: expect.arrayContaining([
            expect.objectContaining({ id: "a", cups_today: 0 }),
          ]),
        }),
      );
    },
  );
  it("keeps the first valid daily order number for each booth", async () => {
    gate.mockResolvedValue({
      vendor: {
        id: "vendor-a",
        board_settings: { daily_order_number_reset: true },
      },
    });
    fixtures.booths = { data: booths };
    fixtures.baselines = {
      data: [
        { booth_id: "a", order_number: null, created_at: NOW_ISO },
        { booth_id: "a", order_number: "A001", created_at: NOW_ISO },
        { booth_id: "a", order_number: "A002", created_at: NOW_ISO },
        { booth_id: "b", order_number: "B003", created_at: NOW_ISO },
      ],
    };
    render(await DashboardPage());
    expect(board).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyOrderNumberBaselines: {
          a: expect.objectContaining({ day: "A001", services: [] }),
          b: expect.objectContaining({ day: "B003", services: [] }),
        },
      }),
    );
  });
  it.each([false, true])(
    "falls back safely when daily baselines are unavailable: %s",
    async (error) => {
      gate.mockResolvedValue({
        vendor: {
          id: "vendor-a",
          board_settings: { daily_order_number_reset: true },
        },
      });
      fixtures.booths = { data: booths };
      fixtures.baselines = error
        ? { data: null, error: { message: "Unavailable" } }
        : { data: null };
      render(await DashboardPage());
      expect(board).toHaveBeenCalledWith(
        expect.objectContaining({
          loadError: false,
          dailyOrderNumberBaselines: {},
        }),
      );
    },
  );
  it("reads numbering through the service client only when daily numbering is on", async () => {
    fixtures.booths = { data: booths };
    render(await DashboardPage());
    expect(serviceClient).not.toHaveBeenCalled();
    gate.mockResolvedValue({
      vendor: {
        id: "vendor-a",
        board_settings: { daily_order_number_reset: true },
      },
    });
    render(await DashboardPage());
    expect(serviceClient).toHaveBeenCalledTimes(1);
  });
  it("does not query daily baselines without booths", async () => {
    gate.mockResolvedValue({
      vendor: {
        id: "vendor-a",
        board_settings: { daily_order_number_reset: true },
      },
    });
    render(await DashboardPage());
    expect(from).not.toHaveBeenCalledWith("orders");
  });
});
