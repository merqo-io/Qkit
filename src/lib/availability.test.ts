import { describe, expect, it } from "vitest";
import {
  NO_LIMITS,
  addBlock,
  addBlockMessage,
  fitCart,
  hasLimits,
  holdsApply,
  parseAvailability,
  type Availability,
} from "./availability";
import type { CartItem } from "./types";

const line = (menuItemId: string, quantity: number): CartItem => ({
  menuItemId,
  name: menuItemId,
  quantity,
});

const avail = (over: Partial<Availability>): Availability => ({
  ...NO_LIMITS,
  ...over,
});

describe("parseAvailability", () => {
  it("reads the booth_availability result", () => {
    expect(
      parseAvailability({
        remaining: { kopi: 2 },
        held: { kopi: 1 },
        left: 4,
        left_held: 3,
        max_per_order: 6,
      }),
    ).toEqual({
      remaining: { kopi: 2 },
      held: { kopi: 1 },
      left: 4,
      leftHeld: 3,
      maxPerOrder: 6,
    });
  });

  it("keeps null for a booth with no daily total or order limit", () => {
    expect(
      parseAvailability({
        remaining: {},
        held: {},
        left: null,
        left_held: 0,
        max_per_order: null,
      }),
    ).toEqual(NO_LIMITS);
  });

  it("returns null for anything that is not the result shape", () => {
    expect(parseAvailability(null)).toBeNull();
    expect(parseAvailability({ left: 3 })).toBeNull();
    expect(
      parseAvailability({
        remaining: {},
        held: {},
        left: -1,
        left_held: 0,
        max_per_order: null,
      }),
    ).toBeNull();
  });
});

describe("hasLimits / holdsApply", () => {
  it("is false for a booth that limits nothing", () => {
    expect(hasLimits(NO_LIMITS)).toBe(false);
    expect(holdsApply(NO_LIMITS)).toBe(false);
  });

  it("an order limit alone is a limit but needs no hold", () => {
    const a = avail({ maxPerOrder: 4 });
    expect(hasLimits(a)).toBe(true);
    expect(holdsApply(a)).toBe(false);
  });

  it("finite stock, per item or for the booth, needs a hold", () => {
    expect(holdsApply(avail({ left: 10 }))).toBe(true);
    expect(holdsApply(avail({ remaining: { kopi: 3 } }))).toBe(true);
  });
});

describe("addBlock", () => {
  it("allows an add when nothing is limited", () => {
    expect(addBlock([line("kopi", 9)], "kopi", NO_LIMITS)).toBeNull();
  });

  it("blocks at the item's remaining stock, pooled across its lines", () => {
    const a = avail({ remaining: { kopi: 3 } });
    expect(addBlock([line("kopi", 2)], "kopi", a)).toBeNull();
    expect(addBlock([line("kopi", 2), line("kopi", 1)], "kopi", a)).toEqual({
      kind: "item_left",
      left: 3,
    });
  });

  it("tells sold out apart from held in another basket", () => {
    expect(addBlock([], "kopi", avail({ remaining: { kopi: 0 } }))).toEqual({
      kind: "sold_out",
    });
    expect(
      addBlock(
        [],
        "kopi",
        avail({ remaining: { kopi: 0 }, held: { kopi: 2 } }),
      ),
    ).toEqual({ kind: "item_held" });
  });

  it("blocks at the booth's daily total across every item", () => {
    const a = avail({ left: 3 });
    expect(addBlock([line("kopi", 2)], "teh", a)).toBeNull();
    expect(addBlock([line("kopi", 2), line("teh", 1)], "milo", a)).toEqual({
      kind: "booth_left",
      left: 3,
    });
  });

  it("tells a booth that is out apart from one whose last items are held", () => {
    expect(addBlock([], "kopi", avail({ left: 0 }))).toEqual({
      kind: "booth_sold_out",
    });
    expect(addBlock([], "kopi", avail({ left: 0, leftHeld: 4 }))).toEqual({
      kind: "booth_held",
    });
  });

  it("blocks at the per-order limit", () => {
    const a = avail({ maxPerOrder: 2 });
    expect(addBlock([line("kopi", 1)], "teh", a)).toBeNull();
    expect(addBlock([line("kopi", 1), line("teh", 1)], "teh", a)).toEqual({
      kind: "order_limit",
      max: 2,
    });
  });

  it("reports the item's stock before the booth total or order limit", () => {
    const a = avail({ remaining: { kopi: 1 }, left: 1, maxPerOrder: 1 });
    expect(addBlock([line("kopi", 1)], "kopi", a)).toEqual({
      kind: "item_left",
      left: 1,
    });
  });
});

describe("addBlockMessage", () => {
  it("uses the singular for one item", () => {
    expect(addBlockMessage({ kind: "order_limit", max: 1 })).toBe(
      "This stall takes up to 1 item per order.",
    );
    expect(addBlockMessage({ kind: "booth_left", left: 2 })).toBe(
      "This stall has only 2 items left.",
    );
  });

  it("has a sentence for every kind", () => {
    const kinds = [
      { kind: "sold_out" },
      { kind: "item_held" },
      { kind: "item_left", left: 2 },
      { kind: "booth_sold_out" },
      { kind: "booth_held" },
      { kind: "booth_left", left: 1 },
      { kind: "order_limit", max: 3 },
    ] as const;
    for (const k of kinds) expect(addBlockMessage(k)).not.toBe("");
  });
});

describe("fitCart", () => {
  it("returns the same array when everything fits", () => {
    const items = [line("kopi", 2), line("teh", 1)];
    const out = fitCart(items, avail({ left: 5, maxPerOrder: 3 }));
    expect(out.trimmed).toBe(0);
    expect(out.items).toBe(items);
  });

  it("trims an item to its remaining stock, pooled across lines", () => {
    const out = fitCart(
      [line("kopi", 2), line("kopi", 2)],
      avail({ remaining: { kopi: 3 } }),
    );
    expect(out.items.map((i) => i.quantity)).toEqual([2, 1]);
    expect(out.trimmed).toBe(1);
  });

  it("drops a line that has no stock left", () => {
    const out = fitCart(
      [line("kopi", 1), line("teh", 2)],
      avail({ remaining: { teh: 0 } }),
    );
    expect(out.items).toEqual([line("kopi", 1)]);
    expect(out.trimmed).toBe(2);
  });

  it("trims from the end to fit the booth's daily total", () => {
    const out = fitCart(
      [line("kopi", 2), line("teh", 2), line("milo", 1)],
      avail({ left: 3 }),
    );
    expect(out.items).toEqual([line("kopi", 2), line("teh", 1)]);
    expect(out.trimmed).toBe(2);
  });

  it("applies the smaller of the daily total and the per-order limit", () => {
    const out = fitCart([line("kopi", 5)], avail({ left: 4, maxPerOrder: 2 }));
    expect(out.items).toEqual([line("kopi", 2)]);
    expect(out.trimmed).toBe(3);
  });

  it("empties the basket when nothing is left", () => {
    const out = fitCart([line("kopi", 1)], avail({ left: 0 }));
    expect(out.items).toEqual([]);
    expect(out.trimmed).toBe(1);
  });
});
