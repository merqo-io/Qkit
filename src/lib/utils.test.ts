import { cn } from "@merqo/ui/primitives";
import { describe, expect, it } from "vitest";
import {
  count,
  formatOptions,
  formatPrice,
  orderHasPricing,
  parseDollarsToCents,
} from "./utils";

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

describe("formatPrice", () => {
  it("formats 1000 cents as SGD 10", () => {
    const result = formatPrice(1000);
    expect(result).toContain("10");
    expect(result).toContain("$");
  });

  it("formats 0 as $0", () => {
    expect(formatPrice(0)).toContain("0");
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

describe("parseDollarsToCents", () => {
  it("rounds a dollar string to integer cents", () => {
    expect(parseDollarsToCents("5.50")).toEqual({ ok: true, cents: 550 });
    expect(parseDollarsToCents("0")).toEqual({ ok: true, cents: 0 });
    expect(parseDollarsToCents("  6  ")).toEqual({ ok: true, cents: 600 });
  });

  it("rounds to the nearest cent", () => {
    expect(parseDollarsToCents("0.125")).toEqual({ ok: true, cents: 13 }); // 12.5 → 13
    expect(parseDollarsToCents("1.234")).toEqual({ ok: true, cents: 123 });
  });

  it("treats empty/whitespace as a cleared field (undefined cents)", () => {
    expect(parseDollarsToCents("")).toEqual({ ok: true, cents: undefined });
    expect(parseDollarsToCents("   ")).toEqual({ ok: true, cents: undefined });
  });

  it("rejects NaN and negative input", () => {
    expect(parseDollarsToCents("abc")).toEqual({ ok: false });
    expect(parseDollarsToCents("-3")).toEqual({ ok: false });
  });

  it("rejects non-finite input", () => {
    expect(parseDollarsToCents("Infinity")).toEqual({ ok: false });
    expect(parseDollarsToCents("-Infinity")).toEqual({ ok: false });
    expect(parseDollarsToCents("1e400")).toEqual({ ok: false });
  });
});
