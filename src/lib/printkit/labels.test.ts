import { describe, expect, it } from "vitest";
import { orderLabels } from "./labels";

describe("order label expansion", () => {
  it("expands mixed quantities and retains chosen options per unit", () => {
    expect(
      orderLabels([
        {
          name: "Kopi",
          quantity: 2,
          options: [{ group: "Sugar", choice: "Less" }],
        },
        { name: "Toast", quantity: 1 },
      ]),
    ).toEqual([
      { item_name: "Kopi", item_options: "Sugar: Less" },
      { item_name: "Kopi", item_options: "Sugar: Less" },
      { item_name: "Toast" },
    ]);
  });
  it("does not turn an empty walk-up order into a label", () =>
    expect(orderLabels([])).toEqual([]));
  it.each(
    [
      null,
      {},
      [{ name: "Tea", quantity: 0 }],
      [{ name: "Tea", quantity: -1 }],
      [{ name: "Tea", quantity: 1.5 }],
      [{ name: "Tea", quantity: "2" }],
      [{ name: "Tea", quantity: 101 }],
      [
        { name: "Tea", quantity: 51 },
        { name: "Kopi", quantity: 50 },
      ],
      [{ name: " ", quantity: 1 }],
    ].map((items) => ({ items })),
  )("rejects malformed and oversized snapshots", ({ items }) =>
    expect(orderLabels(items)).toBeNull(),
  );
  it("allows exactly 100 units", () =>
    expect(orderLabels([{ name: "Tea", quantity: 100 }])).toHaveLength(100));
  it("rejects verbose modifiers instead of silently dropping preparation details", () =>
    expect(
      orderLabels([
        {
          name: "Tea",
          quantity: 1,
          options: [{ group: "x", choice: "x".repeat(500) }],
        },
      ]),
    ).toBeNull());
});
