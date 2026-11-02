import { describe, expect, it, vi } from "vitest";
import {
  numberingBaselines,
  numberingBaselinesByBooth,
  numberingStartIso,
  vendorFacingOrderNumber,
} from "./daily-order-number";
import { baselineFor } from "@/lib/numbering-baselines";
import { sgtStartOfDayIso } from "@/lib/tz";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import { displayOrderNumber } from "@/lib/orders";

type Client = Parameters<typeof numberingBaselines>[0];

// A stand-in for the reads these helpers make: the vendor's settings, the
// booth's restart stamp and its first order since SGT midnight / since the
// restart. `firstService` defaults to `firstToday`.
function fakeClient(rows: {
  settings?: unknown;
  firstToday?: string | null;
  firstService?: string | null;
  capResetAt?: string | null;
  createdAt?: string | null;
}) {
  const dayStart = sgtStartOfDayIso();
  const orderRow = (n: string | null | undefined) =>
    n === null || n === undefined ? null : { order_number: n };
  const gte = vi.fn((_col: string, since: string) => ({
    order: () => ({
      limit: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: orderRow(
              since === dayStart
                ? rows.firstToday
                : (rows.firstService ?? rows.firstToday),
            ),
          }),
      }),
    }),
  }));
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
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { cap_reset_at: rows.capResetAt ?? null },
              }),
          }),
        }),
      };
    return {
      select: () => ({
        eq: () => ({
          gte,
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: rows.createdAt ? { created_at: rows.createdAt } : null,
              }),
          }),
        }),
      }),
    };
  });
  return { client: { from } as unknown as Client, from, gte };
}

const RESET_ON = { ...DEFAULT_BOARD_SETTINGS, daily_order_number_reset: true };
const RESET_OFF = {
  ...DEFAULT_BOARD_SETTINGS,
  daily_order_number_reset: false,
};

describe("numberingBaselines", () => {
  it("returns the booth's first order number of the day", async () => {
    const { client, from } = fakeClient({ firstToday: "0845" });
    expect(await numberingBaselines(client, "b1")).toEqual({
      day: "0845",
      service: "0845",
      serviceStart: sgtStartOfDayIso(),
    });
    expect(from).toHaveBeenCalledWith("orders");
  });

  it("returns null baselines for a booth with no order yet today", async () => {
    const { client } = fakeClient({ firstToday: null });
    expect(await numberingBaselines(client, "b1")).toEqual({
      day: null,
      service: null,
      serviceStart: sgtStartOfDayIso(),
    });
  });

  it("only looks at orders placed since the start of the SGT day", async () => {
    const { client, gte } = fakeClient({ firstToday: "0845" });
    await numberingBaselines(client, "b1");
    expect(gte).toHaveBeenCalledWith("created_at", sgtStartOfDayIso());
  });
});

describe("numberingStartIso", () => {
  it("uses the SGT day start when the booth was never reset", () => {
    expect(numberingStartIso(null)).toBe(sgtStartOfDayIso());
  });

  it("uses a reset made earlier than today as no reset at all", () => {
    expect(numberingStartIso("2000-01-01T00:00:00Z")).toBe(sgtStartOfDayIso());
  });

  it("uses a reset made after SGT midnight", () => {
    const reset = new Date(Date.now() + 60_000).toISOString();
    expect(numberingStartIso(reset)).toBe(reset);
  });
});

describe("baselineFor", () => {
  const dayStart = "2026-10-11T00:00:00.000Z";
  const baselines = {
    day: "0010",
    service: "0013",
    serviceStart: "2026-10-11T04:00:00.000Z",
  };

  it("uses the service baseline for an order after the restart", () => {
    const b = baselineFor("2026-10-11T05:00:00.000Z", baselines, dayStart);
    expect(displayOrderNumber("0013", b)).toBe("001");
  });

  it("uses the day baseline for an order before the restart the same day", () => {
    const b = baselineFor("2026-10-11T01:00:00.000Z", baselines, dayStart);
    expect(displayOrderNumber("0010", b)).toBe("001");
    expect(displayOrderNumber("0012", b)).toBe("003");
  });

  it("gives an order from a previous day no baseline", () => {
    const b = baselineFor("2026-10-10T20:00:00.000Z", baselines, dayStart);
    expect(b).toBeNull();
    expect(displayOrderNumber("0009", b)).toBe("0009");
  });

  it("uses the day baseline for every order when there was no restart today", () => {
    const noRestart = { day: "0010", service: "0010", serviceStart: dayStart };
    const b = baselineFor("2026-10-11T05:00:00.000Z", noRestart, dayStart);
    expect(displayOrderNumber("0014", b)).toBe("005");
  });

  it("fails open on missing or unparseable input", () => {
    expect(
      baselineFor("2026-10-11T05:00:00.000Z", undefined, dayStart),
    ).toBeNull();
    expect(baselineFor(undefined, baselines, dayStart)).toBeNull();
    expect(baselineFor("not a date", baselines, dayStart)).toBeNull();
  });
});

describe("Start new service restarts the display number", () => {
  const now = Date.now();
  const at = (minutesAgo: number) =>
    new Date(now - minutesAgo * 60_000).toISOString();

  function batchClient(
    capResetAt: string | null,
    orders: { booth_id: string; order_number: string; created_at: string }[],
  ) {
    const query = {
      select: () => query,
      in: () => query,
      gte: () => query,
      order: () => query,
      range: async (from: number, to: number) => ({
        data: orders.slice(from, to + 1),
        error: null,
      }),
    };
    return {
      from: (table: string) =>
        table === "booths"
          ? {
              select: () => ({
                in: async () => ({
                  data: [{ id: "b1", cap_reset_at: capResetAt }],
                  error: null,
                }),
              }),
            }
          : query,
    } as unknown as Client;
  }

  const orders = [
    { booth_id: "b1", order_number: "0010", created_at: at(120) },
    { booth_id: "b1", order_number: "0011", created_at: at(60) },
    { booth_id: "b1", order_number: "0012", created_at: at(-1) },
  ];

  it("returns both baselines per booth", async () => {
    const reset = at(0);
    const { b1 } = await numberingBaselinesByBooth(batchClient(reset, orders), [
      "b1",
    ]);
    expect(b1).toEqual({ day: "0010", service: "0012", serviceStart: reset });
  });

  it("ranks the first order after the reset as 001", async () => {
    const { b1 } = await numberingBaselinesByBooth(batchClient(at(0), orders), [
      "b1",
    ]);
    expect(
      displayOrderNumber("0012", baselineFor(orders[2].created_at, b1)),
    ).toBe("001");
  });

  it("keeps the number an order showed when it was open across the reset", async () => {
    const { b1 } = await numberingBaselinesByBooth(batchClient(at(0), orders), [
      "b1",
    ]);
    expect(
      displayOrderNumber("0010", baselineFor(orders[0].created_at, b1)),
    ).toBe("001");
    expect(
      displayOrderNumber("0011", baselineFor(orders[1].created_at, b1)),
    ).toBe("002");
  });

  it("has only a day baseline until an order is placed after the reset", async () => {
    const reset = at(0);
    const result = await numberingBaselinesByBooth(
      batchClient(reset, [orders[1]]),
      ["b1"],
    );
    expect(result).toEqual({
      b1: { day: "0011", service: null, serviceStart: reset },
    });
  });

  it("without a reset ranks every order from the day's first", async () => {
    const { b1 } = await numberingBaselinesByBooth(
      batchClient(null, [
        { booth_id: "b1", order_number: "0010", created_at: at(1) },
        { booth_id: "b1", order_number: "0011", created_at: at(0) },
      ]),
      ["b1"],
    );
    expect(b1.day).toBe("0010");
    expect(b1.service).toBe("0010");
    expect(displayOrderNumber("0011", baselineFor(at(0), b1))).toBe("002");
  });

  it("single-booth lookup gives no baselines when the booth read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "boom" },
            }),
          }),
        }),
      }),
    } as unknown as Client;
    expect(await numberingBaselines(client, "b1")).toBeNull();
    spy.mockRestore();
  });

  it("batched lookup returns nothing when a read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: null, error: { message: "boom" } }),
        }),
      }),
    } as unknown as Client;
    expect(await numberingBaselinesByBooth(client, ["b1"])).toEqual({});
    spy.mockRestore();
  });

  it("single-booth lookup asks for orders since the reset and since midnight", async () => {
    const reset = new Date(Date.now() + 60_000).toISOString();
    const { client, gte } = fakeClient({
      firstToday: "0010",
      firstService: "0012",
      capResetAt: reset,
    });
    expect(await numberingBaselines(client, "b1")).toEqual({
      day: "0010",
      service: "0012",
      serviceStart: reset,
    });
    expect(gte).toHaveBeenCalledWith("created_at", reset);
    expect(gte).toHaveBeenCalledWith("created_at", sgtStartOfDayIso());
  });

  it("vendorFacingOrderNumber shows 001 for the first order after the reset", async () => {
    const reset = new Date(Date.now() - 60_000).toISOString();
    const { client } = fakeClient({
      settings: RESET_ON,
      firstToday: "0010",
      firstService: "0012",
      capResetAt: reset,
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0012",
        createdAt: new Date().toISOString(),
      }),
    ).toBe("001");
  });

  it("vendorFacingOrderNumber keeps an order placed before the reset on its earlier number", async () => {
    const reset = new Date(Date.now() - 60_000).toISOString();
    const { client } = fakeClient({
      settings: RESET_ON,
      firstToday: "0010",
      firstService: "0012",
      capResetAt: reset,
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0011",
        createdAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    ).toBe("002");
  });

  it("vendorFacingOrderNumber reads the order's created_at when the caller has none", async () => {
    const reset = new Date(Date.now() - 60_000).toISOString();
    const { client } = fakeClient({
      settings: RESET_ON,
      firstToday: "0010",
      firstService: "0012",
      capResetAt: reset,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
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
      firstToday: "0012",
      capResetAt: at(0),
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0012",
        createdAt: new Date().toISOString(),
      }),
    ).toBe("0012");
  });
});

describe("daily numbering at the lifetime counter boundary", () => {
  const nowIso = new Date().toISOString();
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
  const placed = new Date().toISOString();

  it("gives the day's rank when daily numbering is on", async () => {
    const { client } = fakeClient({ settings: RESET_ON, firstToday: "0845" });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("003");
  });

  it("gives the permanent number when daily numbering is off, without reading orders", async () => {
    const { client, from } = fakeClient({
      settings: RESET_OFF,
      firstToday: "0845",
    });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("0847");
    expect(from).not.toHaveBeenCalledWith("orders");
  });

  it("gives the permanent number when the vendor's settings cannot be read", async () => {
    const { client } = fakeClient({ firstToday: "0845" });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("0847");
  });

  it("gives the permanent number when no order has been placed today", async () => {
    const { client } = fakeClient({ settings: RESET_ON, firstToday: null });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: placed,
      }),
    ).toBe("0847");
  });

  it("gives the permanent number when the order's date cannot be read", async () => {
    const { client } = fakeClient({ settings: RESET_ON, firstToday: "0845" });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
      }),
    ).toBe("0847");
  });

  it("gives the permanent number to an order from an earlier day", async () => {
    const { client } = fakeClient({ settings: RESET_ON, firstToday: "0845" });
    expect(
      await vendorFacingOrderNumber(client, "v1", "b1", {
        orderNumber: "0847",
        createdAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(),
      }),
    ).toBe("0847");
  });
});
