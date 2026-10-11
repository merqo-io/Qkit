import { installBrowserStorage } from "../../test/browser-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecentOrder,
  getRecentOrders,
  getRecentOrdersForBooth,
  noteDisplayNumber,
} from "./recent-orders";

beforeEach(() => {
  vi.unstubAllGlobals();
  installBrowserStorage("localStorage");
});

describe("recent-orders", () => {
  it("returns empty when nothing stored", () => {
    expect(getRecentOrders()).toEqual([]);
    expect(getRecentOrdersForBooth("b1")).toEqual([]);
  });

  it("adds and stamps placedAt, newest first", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    addRecentOrder({ boothId: "b1", orderNumber: "0001", customerName: "Ada" });
    vi.spyOn(Date, "now").mockReturnValue(2000);
    addRecentOrder({ boothId: "b1", orderNumber: "0002", customerName: "Bo" });

    const all = getRecentOrders();
    expect(all.map((o) => o.orderNumber)).toEqual(["0002", "0001"]);
    expect(all[0].placedAt).toBe(2000);
  });

  it("dedupes by booth + order number, keeping the latest", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    addRecentOrder({ boothId: "b1", orderNumber: "0001", customerName: "Ada" });
    vi.spyOn(Date, "now").mockReturnValue(5000);
    addRecentOrder({
      boothId: "b1",
      orderNumber: "0001",
      customerName: "Ada R.",
    });

    const all = getRecentOrders();
    expect(all).toHaveLength(1);
    expect(all[0].customerName).toBe("Ada R.");
    expect(all[0].placedAt).toBe(5000);
  });

  it("filters by booth", () => {
    addRecentOrder({ boothId: "b1", orderNumber: "0001", customerName: "Ada" });
    addRecentOrder({ boothId: "b2", orderNumber: "0009", customerName: "Bo" });
    expect(getRecentOrdersForBooth("b1").map((o) => o.orderNumber)).toEqual([
      "0001",
    ]);
    expect(getRecentOrdersForBooth("b2").map((o) => o.orderNumber)).toEqual([
      "0009",
    ]);
  });

  it("caps history at 10 entries", () => {
    for (let i = 1; i <= 15; i++) {
      vi.spyOn(Date, "now").mockReturnValue(i);
      addRecentOrder({
        boothId: "b1",
        orderNumber: String(i).padStart(4, "0"),
        customerName: "x",
      });
    }
    const all = getRecentOrders();
    expect(all).toHaveLength(10);
    // Newest (15) kept, oldest (1..5) dropped.
    expect(all[0].orderNumber).toBe("0015");
    expect(all.some((o) => o.orderNumber === "0005")).toBe(false);
  });

  it("round-trips an items snapshot for reorder", () => {
    addRecentOrder({
      boothId: "b1",
      orderNumber: "0001",
      customerName: "Ada",
      items: [
        {
          menuItemId: "latte",
          quantity: 2,
          options: [{ group: "Milk", choice: "Oat" }],
        },
      ],
    });
    expect(getRecentOrdersForBooth("b1")[0].items).toEqual([
      {
        menuItemId: "latte",
        quantity: 2,
        options: [{ group: "Milk", choice: "Oat" }],
      },
    ]);
  });

  it("still loads legacy entries that predate the items field", () => {
    localStorage.setItem(
      "qkit:recent-orders",
      JSON.stringify([
        {
          boothId: "b1",
          orderNumber: "0001",
          customerName: "Ada",
          placedAt: 1,
        },
      ]),
    );
    const [entry] = getRecentOrdersForBooth("b1");
    expect(entry.orderNumber).toBe("0001");
    expect(entry.items).toBeUndefined();
  });

  it("swallows storage write failures (private mode / quota)", () => {
    const throwingLs = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    vi.stubGlobal("window", { localStorage: throwingLs });
    vi.stubGlobal("localStorage", throwingLs);
    expect(() =>
      addRecentOrder({
        boothId: "b1",
        orderNumber: "0001",
        customerName: "Ada",
      }),
    ).not.toThrow();
  });

  it("sorts by placedAt descending regardless of stored order", () => {
    localStorage.setItem(
      "qkit:recent-orders",
      JSON.stringify([
        {
          boothId: "b1",
          orderNumber: "0001",
          customerName: "A",
          placedAt: 100,
        },
        {
          boothId: "b1",
          orderNumber: "0002",
          customerName: "B",
          placedAt: 300,
        },
        {
          boothId: "b1",
          orderNumber: "0003",
          customerName: "C",
          placedAt: 200,
        },
      ]),
    );
    expect(getRecentOrders().map((o) => o.orderNumber)).toEqual([
      "0002",
      "0003",
      "0001",
    ]);
  });

  it.each([
    ["boothId", { orderNumber: "0001", customerName: "A", placedAt: 1 }],
    ["orderNumber", { boothId: "b1", customerName: "A", placedAt: 1 }],
    ["customerName", { boothId: "b1", orderNumber: "0001", placedAt: 1 }],
    ["placedAt", { boothId: "b1", orderNumber: "0001", customerName: "A" }],
  ])("drops an entry missing %s", (_field, obj) => {
    localStorage.setItem("qkit:recent-orders", JSON.stringify([obj]));
    expect(getRecentOrders()).toEqual([]);
  });

  it("tolerates garbage in storage", () => {
    localStorage.setItem("qkit:recent-orders", "not json");
    expect(getRecentOrders()).toEqual([]);
    localStorage.setItem("qkit:recent-orders", JSON.stringify({ not: "arr" }));
    expect(getRecentOrders()).toEqual([]);
    localStorage.setItem(
      "qkit:recent-orders",
      JSON.stringify([{ boothId: "b1" }, 42, null]),
    );
    // Malformed entries dropped.
    expect(getRecentOrders()).toEqual([]);
  });

  it("records the number the status page showed, for that order only", () => {
    addRecentOrder({ boothId: "b1", orderNumber: "0041", customerName: "Ada" });
    addRecentOrder({ boothId: "b2", orderNumber: "0041", customerName: "Bo" });

    noteDisplayNumber("b1", "0041", "3");

    const byBooth = Object.fromEntries(
      getRecentOrders().map((o) => [o.boothId, o.displayNumber]),
    );
    expect(byBooth).toEqual({ b1: "3", b2: undefined });
  });

  it("ignores a display number for an order this device never placed", () => {
    noteDisplayNumber("b1", "0041", "3");
    expect(getRecentOrders()).toEqual([]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
