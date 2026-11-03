import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  numberingBaselines,
  numberingBaselinesByBooth,
  numberingStateByBooth,
  serviceStartsByBooth,
  vendorFacingOrderNumber,
} from "./daily-order-number";
import { baselineFor } from "@/lib/numbering-baselines";
import { sgtStartOfDayIso } from "@/lib/tz";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import { displayOrderNumber } from "@/lib/orders";

type Client = Parameters<typeof numberingBaselines>[0];
type OrderRow = { booth_id: string; order_number: string; created_at: string };

// Pinned to mid-day SGT so fixtures placed minutes after "SGT midnight" never
// straddle the Singapore business-day boundary, whatever time the suite runs.
const PINNED_NOW = Date.parse("2026-10-11T04:00:00.000Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// Fixtures are built while the file is collected, before the clock is pinned,
// so they derive their day from the pinned instant rather than the live clock.
const dayStartMs = () => Date.parse(sgtStartOfDayIso(new Date(PINNED_NOW)));
const soon = (seconds: number) =>
  new Date(dayStartMs() + seconds * 1000).toISOString();

// A stand-in for the reads these helpers make: the vendor's settings, the
// booth's restart stamp, the restart log and today's orders.
function fakeClient(rows: {
  settings?: unknown;
  orders?: OrderRow[];
  capResetAt?: string | null;
  starts?: string[];
  startsError?: boolean;
  boothError?: boolean;
  createdAt?: string | null;
}) {
  const orders = rows.orders ?? [];
  const orderQuery = {
    select: () => orderQuery,
    in: () => orderQuery,
    gte: () => orderQuery,
    order: () => orderQuery,
    eq: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: rows.createdAt ? { created_at: rows.createdAt } : null,
          }),
      }),
    }),
    range: async (from: number, to: number) => ({
      data: orders.slice(from, to + 1),
      error: null,
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === "vendors")
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  rows.settings === undefined
                    ? null
                    : { board_settings: rows.settings },
              }),
          }),
        }),
      };
    if (table === "booths")
      return {
        select: () => ({
          in: async () =>
            rows.boothError
              ? { data: null, error: { message: "boom" } }
              : {
                  data: [{ id: "b1", cap_reset_at: rows.capResetAt ?? null }],
                  error: null,
                },
        }),
      };
    if (table === "booth_service_starts")
      return {
        select: () => ({
          in: () => ({
            gte: async () =>
              rows.startsError
                ? { data: null, error: { message: "no such table" } }
                : {
                    data: (rows.starts ?? []).map((started_at) => ({
                      booth_id: "b1",
                      started_at,
                    })),
                    error: null,
                  },
          }),
        }),
      };
    return orderQuery;
  });
  return { client: { from } as unknown as Client, from };
}

const RESET_ON = { ...DEFAULT_BOARD_SETTINGS, daily_order_number_reset: true };
const RESET_OFF = {
  ...DEFAULT_BOARD_SETTINGS,
  daily_order_number_reset: false,
};

const order = (n: string, created_at: string, booth_id = "b1"): OrderRow => ({
  booth_id,
  order_number: n,
  created_at,
});

describe("numberingBaselines", () => {
  it("returns the booth's first order number of the day", async () => {
    const { client, from } = fakeClient({
      orders: [order("0845", soon(10)), order("0846", soon(20))],
    });
    expect(await numberingBaselines(client, "b1")).toEqual({
      day: "0845",
      services: [],
    });
    expect(from).toHaveBeenCalledWith("orders");
  });

  it("returns null baselines for a booth with no order yet today", async () => {
    const { client } = fakeClient({});
    expect(await numberingBaselines(client, "b1")).toEqual({
      day: null,
      services: [],
    });
  });

  it("keeps a restart with no order after it as an empty service window", async () => {
    const start = soon(100);
    const { client } = fakeClient({
      orders: [order("0845", soon(10))],
      starts: [start],
    });
    expect(await numberingBaselines(client, "b1")).toEqual({
      day: "0845",
      services: [{ start, baseline: null }],
    });
  });

  it("is null when the booth cannot be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ boothError: true });
    expect(await numberingBaselines(client, "b1")).toBeNull();
    spy.mockRestore();
  });
});

describe("serviceStartsByBooth", () => {
  it("merges the log with cap_reset_at and drops yesterday's restarts", async () => {
    const a = soon(100);
    const b = soon(200);
    const { client } = fakeClient({
      capResetAt: b,
      starts: [a, b, "2000-01-01T00:00:00.000Z"],
    });
    expect(await serviceStartsByBooth(client, ["b1"])).toEqual({
      b1: [a, b],
    });
  });

  it("falls back to cap_reset_at when the log cannot be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = soon(300);
    const { client } = fakeClient({ capResetAt: reset, startsError: true });
    expect(await serviceStartsByBooth(client, ["b1"])).toEqual({
      b1: [reset],
    });
    spy.mockRestore();
  });

  it("ignores a cap_reset_at from an earlier day", async () => {
    const { client } = fakeClient({ capResetAt: "2000-01-01T00:00:00Z" });
    expect(await serviceStartsByBooth(client, ["b1"])).toEqual({});
  });
});

describe("numberingStateByBooth", () => {
  it("returns a booth's restarts even when it has no order yet", async () => {
    const start = soon(100);
    const { client } = fakeClient({ starts: [start] });
    expect(await numberingStateByBooth(client, ["b1"])).toEqual({
      baselines: {},
      starts: { b1: [start] },
    });
  });

  it("returns baselines and starts from one read", async () => {
    const start = soon(100);
    const { client } = fakeClient({
      orders: [order("0010", soon(10)), order("0011", soon(150))],
      starts: [start],
    });
    expect(await numberingStateByBooth(client, ["b1"])).toEqual({
      baselines: {
        b1: { day: "0010", services: [{ start, baseline: "0011" }] },
      },
      starts: { b1: [start] },
    });
  });

  it("is empty and logs the reason when a read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ boothError: true });
    expect(await numberingStateByBooth(client, ["b1"])).toEqual({
      baselines: {},
      starts: {},
    });
    expect(spy).toHaveBeenCalledWith("daily-baseline read failed", "boom");
    spy.mockRestore();
  });

  it("is empty for no booths without reading", async () => {
    const { client, from } = fakeClient({});
    expect(await numberingStateByBooth(client, [])).toEqual({
      baselines: {},
      starts: {},
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("baselineFor", () => {
  const dayStart = "2026-10-11T00:00:00.000Z";
  const baselines = (starts: [string, string | null][]) => ({
    day: "0010",
    services: starts.map(([start, baseline]) => ({ start, baseline })),
  });
  const show = (
    n: string,
    createdAt: string,
    b: ReturnType<typeof baselines>,
  ) => displayOrderNumber(n, baselineFor(createdAt, b, dayStart));

  it("ranks from midnight with no restart today", () => {
    const b = baselines([]);
    expect(show("0010", "2026-10-11T01:00:00.000Z", b)).toBe("001");
    expect(show("0014", "2026-10-11T05:00:00.000Z", b)).toBe("005");
  });

  it("ranks an order after one restart from that restart, earlier ones from midnight", () => {
    const b = baselines([["2026-10-11T04:00:00.000Z", "0013"]]);
    expect(show("0013", "2026-10-11T05:00:00.000Z", b)).toBe("001");
    expect(show("0010", "2026-10-11T01:00:00.000Z", b)).toBe("001");
    expect(show("0012", "2026-10-11T03:59:00.000Z", b)).toBe("003");
  });

  it("keeps every earlier order's number across two restarts", () => {
    const b = baselines([
      ["2026-10-11T04:00:00.000Z", "0013"],
      ["2026-10-11T08:00:00.000Z", "0020"],
    ]);
    expect(show("0010", "2026-10-11T01:00:00.000Z", b)).toBe("001");
    expect(show("0013", "2026-10-11T05:00:00.000Z", b)).toBe("001");
    expect(show("0014", "2026-10-11T06:00:00.000Z", b)).toBe("002");
    expect(show("0020", "2026-10-11T09:00:00.000Z", b)).toBe("001");
  });

  it("ranks from the latest of three restarts", () => {
    const b = baselines([
      ["2026-10-11T02:00:00.000Z", "0011"],
      ["2026-10-11T04:00:00.000Z", "0015"],
      ["2026-10-11T06:00:00.000Z", "0019"],
    ]);
    expect(show("0011", "2026-10-11T03:00:00.000Z", b)).toBe("001");
    expect(show("0016", "2026-10-11T05:00:00.000Z", b)).toBe("002");
    expect(show("0021", "2026-10-11T07:00:00.000Z", b)).toBe("003");
  });

  it("starts the new window at the restart instant", () => {
    const b = baselines([["2026-10-11T04:00:00.000Z", "0013"]]);
    expect(show("0013", "2026-10-11T04:00:00.000Z", b)).toBe("001");
    expect(show("0012", "2026-10-11T03:59:59.999Z", b)).toBe("003");
  });

  it("gives an order from a previous day no baseline", () => {
    const b = baselines([["2026-10-11T04:00:00.000Z", "0013"]]);
    expect(baselineFor("2026-10-10T20:00:00.000Z", b, dayStart)).toBeNull();
    expect(show("0009", "2026-10-10T20:00:00.000Z", b)).toBe("0009");
  });

  it("has no baseline for an order in a service window with no numbered order", () => {
    const b = baselines([["2026-10-11T04:00:00.000Z", null]]);
    expect(baselineFor("2026-10-11T05:00:00.000Z", b, dayStart)).toBeNull();
  });

  it("fails open on missing or unparseable input", () => {
    const b = baselines([]);
    expect(
      baselineFor("2026-10-11T05:00:00.000Z", undefined, dayStart),
    ).toBeNull();
    expect(baselineFor(undefined, b, dayStart)).toBeNull();
    expect(baselineFor("not a date", b, dayStart)).toBeNull();
  });
});

describe("Start new service restarts the display number", () => {
  const orders = [
    order("0010", soon(10)),
    order("0011", soon(20)),
    order("0012", soon(40)),
  ];

  it("returns day and per-service baselines per booth", async () => {
    const reset = soon(30);
    const { client } = fakeClient({
      orders,
      capResetAt: reset,
      starts: [reset],
    });
    const { b1 } = await numberingBaselinesByBooth(client, ["b1"]);
    expect(b1).toEqual({
      day: "0010",
      services: [{ start: reset, baseline: "0012" }],
    });
  });

  it("keeps the number each order showed across two restarts", async () => {
    const first = soon(15);
    const second = soon(35);
    const { client } = fakeClient({
      orders: [
        order("0010", soon(10)),
        order("0011", soon(20)),
        order("0012", soon(25)),
        order("0013", soon(40)),
      ],
      capResetAt: second,
      starts: [first, second],
    });
    const { b1 } = await numberingBaselinesByBooth(client, ["b1"]);
    const shown = (n: string, at: number) =>
      displayOrderNumber(n, baselineFor(soon(at), b1));
    expect(shown("0010", 10)).toBe("001");
    expect(shown("0011", 20)).toBe("001");
    expect(shown("0012", 25)).toBe("002");
    expect(shown("0013", 40)).toBe("001");
  });

  it("has an empty service window until an order is placed after the restart", async () => {
    const reset = soon(30);
    const { client } = fakeClient({
      orders: [orders[1]],
      capResetAt: reset,
      starts: [reset],
    });
    expect(await numberingBaselinesByBooth(client, ["b1"])).toEqual({
      b1: { day: "0011", services: [{ start: reset, baseline: null }] },
    });
  });

  it("works without the restart log, from cap_reset_at alone", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = soon(30);
    const { client } = fakeClient({
      orders,
      capResetAt: reset,
      startsError: true,
    });
    const { b1 } = await numberingBaselinesByBooth(client, ["b1"]);
    expect(b1.services).toEqual([{ start: reset, baseline: "0012" }]);
    spy.mockRestore();
  });

  it("batched lookup returns nothing when a read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ boothError: true });
    expect(await numberingBaselinesByBooth(client, ["b1"])).toEqual({});
    spy.mockRestore();
  });

  it("vendorFacingOrderNumber shows 001 for the first order after the reset", async () => {
    const reset = soon(30);
    const { client } = fakeClient({
      settings: RESET_ON,
      orders,
      capResetAt: reset,
      starts: [reset],
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0012",
        createdAt: soon(40),
      }),
    ).toBe("001");
  });

  it("vendorFacingOrderNumber keeps an order placed before the reset on its earlier number", async () => {
    const reset = soon(30);
    const { client } = fakeClient({
      settings: RESET_ON,
      orders,
      capResetAt: reset,
      starts: [reset],
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0011",
        createdAt: soon(20),
      }),
    ).toBe("002");
  });

  it("vendorFacingOrderNumber reads the order's created_at when the caller has none", async () => {
    const reset = soon(30);
    const { client } = fakeClient({
      settings: RESET_ON,
      orders,
      capResetAt: reset,
      starts: [reset],
      createdAt: soon(20),
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0011",
      }),
    ).toBe("002");
  });

  it("vendorFacingOrderNumber keeps the raw number when the setting is off", async () => {
    const { client } = fakeClient({
      settings: RESET_OFF,
      orders,
      capResetAt: soon(30),
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0012",
        createdAt: soon(40),
      }),
    ).toBe("0012");
  });
});

describe("daily numbering at the lifetime counter boundary", () => {
  const nowIso = soon(10);
  function boundaryClient(
    rows = [
      { booth_id: "b1", order_number: "10000", created_at: nowIso },
      { booth_id: "b1", order_number: "9999", created_at: nowIso },
    ],
  ) {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      gte: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: rows[0], error: null }),
      range: async (from: number, to: number) => ({
        data: rows.slice(from, to + 1),
        error: null,
      }),
    };
    return { from: () => query } as unknown as Client;
  }

  it("keeps the same numeric baseline on customer tracking after order 10000 arrives", async () => {
    const before = await numberingBaselines(
      boundaryClient([
        { booth_id: "b1", order_number: "9999", created_at: nowIso },
      ]),
      "b1",
    );
    const after = await numberingBaselines(boundaryClient(), "b1");
    expect(after?.day).toBe("9999");
    expect(displayOrderNumber("9999", baselineFor(nowIso, before))).toBe("001");
    expect(displayOrderNumber("10000", baselineFor(nowIso, after))).toBe("002");
  });

  it("uses the same numeric baseline on the vendor board", async () => {
    expect(
      (await numberingBaselinesByBooth(boundaryClient(), ["b1"])).b1.day,
    ).toBe("9999");
  });

  it("finds the numeric minimum beyond the API page cap without mixing booths", async () => {
    const client = boundaryClient([
      ...Array.from({ length: 1000 }, (_, index) => ({
        booth_id: "b1",
        order_number: String(10000 + index),
        created_at: nowIso,
      })),
      { booth_id: "b1", order_number: "9999", created_at: nowIso },
      { booth_id: "b2", order_number: "0007", created_at: nowIso },
    ]);
    const result = await numberingBaselinesByBooth(client, ["b1", "b2"]);
    expect(result.b1.day).toBe("9999");
    expect(result.b2.day).toBe("0007");
  });
});

describe("vendorFacingOrderNumber", () => {
  const placed = soon(60);
  const first = [order("0845", soon(10))];

  it("gives the day's rank when daily numbering is on", async () => {
    const { client } = fakeClient({ settings: RESET_ON, orders: first });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("003");
  });

  it("gives the permanent number when daily numbering is off, without reading orders", async () => {
    const { client, from } = fakeClient({ settings: RESET_OFF, orders: first });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("0847");
    expect(from).not.toHaveBeenCalledWith("orders");
  });

  it("gives the permanent number when the vendor's settings cannot be read", async () => {
    const { client } = fakeClient({ orders: first });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("0847");
  });

  it("gives the permanent number when no order has been placed today", async () => {
    const { client } = fakeClient({ settings: RESET_ON });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("0847");
  });

  it("gives the permanent number when the order's date cannot be read", async () => {
    const { client } = fakeClient({ settings: RESET_ON, orders: first });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
      }),
    ).toBe("0847");
  });

  it("gives the permanent number to an order from an earlier day", async () => {
    const { client } = fakeClient({ settings: RESET_ON, orders: first });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(),
      }),
    ).toBe("0847");
  });
});
