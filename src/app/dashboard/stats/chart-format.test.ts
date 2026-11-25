import { describe, expect, it } from "vitest";
import { fmtWait, hourLabel, shortMoney, waitClock } from "./chart-format";

describe("hourLabel", () => {
  it("renders compact am/pm by default (a/p)", () => {
    expect(hourLabel(0)).toBe("12a");
    expect(hourLabel(9)).toBe("9a");
    expect(hourLabel(12)).toBe("12p");
    expect(hourLabel(15)).toBe("3p");
  });

  it("renders the long form with am/pm when long", () => {
    expect(hourLabel(0, { long: true })).toBe("12am");
    expect(hourLabel(9, { long: true })).toBe("9am");
    expect(hourLabel(12, { long: true })).toBe("12pm");
    expect(hourLabel(23, { long: true })).toBe("11pm");
  });
});

describe("fmtWait", () => {
  it("shows seconds under a minute, rounded", () => {
    expect(fmtWait(0)).toBe("0s");
    expect(fmtWait(45)).toBe("45s");
    expect(fmtWait(59)).toBe("59s");
    expect(fmtWait(45.4)).toBe("45s");
  });

  it("shows minutes to one decimal at/above a minute", () => {
    expect(fmtWait(60)).toBe("1.0m");
    expect(fmtWait(252)).toBe("4.2m");
  });
});

describe("waitClock", () => {
  it("shows just seconds under a minute", () => {
    expect(waitClock(0)).toBe("0s");
    expect(waitClock(45)).toBe("45s");
    expect(waitClock(59)).toBe("59s");
  });

  it("floors minutes without over-rounding or a 60s carry", () => {
    expect(waitClock(60)).toBe("1m 0s");
    expect(waitClock(110)).toBe("1m 50s");
    expect(waitClock(119)).toBe("1m 59s");
    expect(waitClock(252)).toBe("4m 12s");
    expect(waitClock(119.6)).toBe("2m 0s"); // rounds to 120 -> 2m 0s, no "1m 60s"
  });
});

describe("shortMoney", () => {
  it("prefixes S$ and abbreviates thousands", () => {
    expect(shortMoney(800)).toBe("S$8");
    expect(shortMoney(99_900)).toBe("S$999");
    expect(shortMoney(120_000)).toBe("S$1.2k");
  });
});
