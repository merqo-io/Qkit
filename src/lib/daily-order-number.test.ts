import { describe, expect, it, vi } from "vitest";
import {
  firstOrderNumberToday,
  firstOrderNumbersToday,
  numberingStartIso,
  vendorFacingOrderNumber,
} from "./daily-order-number";
import { sgtStartOfDayIso } from "@/lib/tz";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";
import { displayOrderNumber } from "@/lib/orders";

type Client = Parameters<typeof firstOrderNumberToday>[0];

// A stand-in for the two reads these helpers make: the vendor's settings and
// the booth's first order of the day.
function fakeClient(rows: {
  settings?: unknown;
  firstToday?: string | null;
  capResetAt?: string | null;
}) {
  const gte = vi.fn((_col: string, _since: string) => ({
    order: () => ({
      limit: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data:
              rows.firstToday === null || rows.firstToday === undefined
                ? null
                : { order_number: rows.firstToday },
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
    return { select: () => ({ eq: () => ({ gte }) }) };
  });
  return { client: { from } as unknown as Client, from, gte };
}

const RESET_ON = { ...DEFAULT_BOARD_SETTINGS, daily_order_number_reset: true };
const RESET_OFF = {
  ...DEFAULT_BOARD_SETTINGS,
  daily_order_number_reset: false,
};

describe("firstOrderNumberToday", () => {
  it("returns the booth's first order number of the day", async () => {
    const { client, from } = fakeClient({ firstToday: "0845" });
    expect(await firstOrderNumberToday(client, "b1")).toBe("0845");
    expect(from).toHaveBeenCalledWith("orders");
  });

  it("returns null for a booth with no order yet today", async () => {
    const { client } = fakeClient({ firstToday: null });
    expect(await firstOrderNumberToday(client, "b1")).toBeNull();
  });

  it("only looks at orders placed since the start of the SGT day", async () => {
    const { client, gte } = fakeClient({ firstToday: "0845" });
    await firstOrderNumberToday(client, "b1");
    expect(gte).toHaveBeenCalledWith(
      "created_at",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
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

  it("ranks the first order after the reset as 001", async () => {
    const client = batchClient(at(0), [
      { booth_id: "b1", order_number: "0010", created_at: at(120) },
      { booth_id: "b1", order_number: "0011", created_at: at(60) },
      { booth_id: "b1", order_number: "0012", created_at: at(-1) },
    ]);
    const { b1 } = await firstOrderNumbersToday(client, ["b1"]);
    expect(b1).toBe("0012");
    expect(displayOrderNumber("0012", b1)).toBe("001");
  });

  it("keeps the permanent number on orders placed before the reset", async () => {
    const client = batchClient(at(0), [
      { booth_id: "b1", order_number: "0011", created_at: at(60) },
      { booth_id: "b1", order_number: "0012", created_at: at(-1) },
    ]);
    const { b1 } = await firstOrderNumbersToday(client, ["b1"]);
    expect(displayOrderNumber("0011", b1)).toBe("0011");
  });

  it("has no baseline until an order is placed after the reset", async () => {
    const client = batchClient(at(0), [
      { booth_id: "b1", order_number: "0011", created_at: at(60) },
    ]);
    expect(await firstOrderNumbersToday(client, ["b1"])).toEqual({});
  });

  it("without a reset ranks from the day's first order", async () => {
    const client = batchClient(null, [
      { booth_id: "b1", order_number: "0010", created_at: at(1) },
      { booth_id: "b1", order_number: "0011", created_at: at(0) },
    ]);
    const { b1 } = await firstOrderNumbersToday(client, ["b1"]);
    expect(displayOrderNumber("0011", b1)).toBe("002");
  });

  it("single-booth lookup gives no baseline when the booth read fails", async () => {
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
    expect(await firstOrderNumberToday(client, "b1")).toBeNull();
    spy.mockRestore();
  });

  it("single-booth lookup asks only for orders since the reset", async () => {
    const reset = new Date(Date.now() + 60_000).toISOString();
    const { client, gte } = fakeClient({
      firstToday: "0012",
      capResetAt: reset,
    });
    expect(await firstOrderNumberToday(client, "b1")).toBe("0012");
    expect(gte).toHaveBeenCalledWith("created_at", reset);
  });

  it("vendorFacingOrderNumber shows 001 for the first order after the reset", async () => {
    const reset = new Date(Date.now() + 60_000).toISOString();
    const { client } = fakeClient({
      settings: RESET_ON,
      firstToday: "0012",
      capResetAt: reset,
    });
    expect(await vendorFacingOrderNumber(client, "v1", "b1", "0012")).toBe(
      "001",
    );
  });

  it("vendorFacingOrderNumber keeps the raw number when the setting is off", async () => {
    const { client } = fakeClient({
      settings: RESET_OFF,
      firstToday: "0012",
      capResetAt: at(0),
    });
    expect(await vendorFacingOrderNumber(client, "v1", "b1", "0012")).toBe(
      "0012",
    );
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
    const before = await firstOrderNumberToday(
      boundaryClient([
        { booth_id: "b1", order_number: "9999", created_at: nowIso },
      ]),
      "b1",
    );
    const after = await firstOrderNumberToday(boundaryClient(), "b1");
    expect(after).toBe("9999");
    expect(displayOrderNumber("9999", before)).toBe("001");
    expect(displayOrderNumber("10000", after)).toBe("002");
  });

  it("uses the same numeric baseline on the vendor board", async () => {
    expect(await firstOrderNumbersToday(boundaryClient(), ["b1"])).toEqual({
      b1: "9999",
    });
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
    expect(await firstOrderNumbersToday(client, ["b1", "b2"])).toEqual({
      b1: "9999",
      b2: "0007",
    });
  });
});

describe("vendorFacingOrderNumber", () => {
  it("gives the day's rank when daily numbering is on", async () => {
    const { client } = fakeClient({ settings: RESET_ON, firstToday: "0845" });
    expect(await vendorFacingOrderNumber(client, "v1", "b1", "0847")).toBe(
      "003",
    );
  });

  it("gives the permanent number when daily numbering is off, without reading orders", async () => {
    const { client, from } = fakeClient({
      settings: RESET_OFF,
      firstToday: "0845",
    });
    expect(await vendorFacingOrderNumber(client, "v1", "b1", "0847")).toBe(
      "0847",
    );
    expect(from).not.toHaveBeenCalledWith("orders");
  });

  it("gives the permanent number when the vendor's settings cannot be read", async () => {
    const { client } = fakeClient({ firstToday: "0845" });
    expect(await vendorFacingOrderNumber(client, "v1", "b1", "0847")).toBe(
      "0847",
    );
  });

  it("gives the permanent number when no order has been placed today", async () => {
    const { client } = fakeClient({ settings: RESET_ON, firstToday: null });
    expect(await vendorFacingOrderNumber(client, "v1", "b1", "0847")).toBe(
      "0847",
    );
  });
});
