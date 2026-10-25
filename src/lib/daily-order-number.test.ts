import { describe, expect, it, vi } from "vitest";
import {
  firstOrderNumberToday,
  vendorFacingOrderNumber,
} from "./daily-order-number";
import { DEFAULT_BOARD_SETTINGS } from "@/lib/types";

type Client = Parameters<typeof firstOrderNumberToday>[0];

// A stand-in for the two reads these helpers make: the vendor's settings and
// the booth's first order of the day.
function fakeClient(rows: { settings?: unknown; firstToday?: string | null }) {
  const gte = vi.fn(() => ({
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
