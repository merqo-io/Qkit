import { cn } from "@merqo/ui/primitives";
import { describe, expect, it } from "vitest";
import { count, formatOptions, orderHasPricing } from "./utils";

describe("count", () => {
  it("pluralizes on anything but 1", () => {
    expect(count(0, "item")).toBe("0 items");
    expect(count(1, "item")).toBe("1 item");
    expect(count(2, "item")).toBe("2 items");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("resolves tailwind conflicts — last wins", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("handles falsy values", () => {
    // eslint-disable-next-line sonarjs/no-redundant-boolean -- the literal `false` is deliberate here: it's simulating a real falsy conditional-classname arg (e.g. `cond && "b"`), the exact case being tested
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("orderHasPricing", () => {
  it("is true when any item has a price", () => {
    expect(
      orderHasPricing([{ price_cents: undefined }, { price_cents: 500 }]),
    ).toBe(true);
  });

  it("is false when no item has a price", () => {
    expect(orderHasPricing([{ price_cents: undefined }, {}])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(orderHasPricing([])).toBe(false);
  });

  it("treats price_cents 0 as priced", () => {
    expect(orderHasPricing([{ price_cents: 0 }])).toBe(true);
  });
});

describe("formatOptions", () => {
  it("joins choices with a middot separator", () => {
    expect(formatOptions([{ choice: "Iced" }, { choice: "Less" }])).toBe(
      "Iced · Less",
    );
  });

  it("returns a single choice unchanged", () => {
    expect(formatOptions([{ choice: "Hot" }])).toBe("Hot");
  });

  it("is empty for no options", () => {
    expect(formatOptions([])).toBe("");
    expect(formatOptions(null)).toBe("");
    expect(formatOptions(undefined)).toBe("");
  });
});
