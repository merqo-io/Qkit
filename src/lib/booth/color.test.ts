import { describe, it, expect } from "vitest";
import { boothColors } from "./color";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `booth-${i}`);

describe("boothColors", () => {
  it("gives up to eight booths eight different colours", () => {
    const colors = boothColors(ids(8));
    expect(new Set(colors.values()).size).toBe(8);
  });

  it("returns oklch strings, one per booth", () => {
    const colors = boothColors(ids(3));
    expect(colors.size).toBe(3);
    for (const c of colors.values()) expect(c).toMatch(/^oklch\(/);
  });

  it("colours by position, so the same list always gets the same colours", () => {
    expect(boothColors(["x", "y"])).toEqual(boothColors(["x", "y"]));
    expect(boothColors(["x", "y"]).get("y")).toBe(
      boothColors(["a", "y"]).get("y"),
    );
  });

  it("keeps the first booths' colours when a newer booth is added", () => {
    const before = boothColors(ids(3));
    const after = boothColors(ids(4));
    for (const id of ids(3)) expect(after.get(id)).toBe(before.get(id));
  });

  it("starts over at the ninth booth", () => {
    const colors = boothColors(ids(9));
    expect(colors.get("booth-8")).toBe(colors.get("booth-0"));
  });

  it("does not collide for ids a hash put on the same colour", () => {
    // Ids that the old 8-hue hash mapped together. By position they cannot.
    const colors = boothColors(["a", "i", "q", "y", "ag"]);
    expect(new Set(colors.values()).size).toBe(5);
  });
});
