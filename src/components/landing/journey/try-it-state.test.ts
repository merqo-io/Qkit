import { describe, expect, it } from "vitest";

import {
  INITIAL_STATE,
  MAX_KOPI,
  announcement,
  phaseOf,
  ticketOf,
  tryItReducer as reduce,
  type TryItAction,
  type TryItState,
} from "./try-it-state";

function run(...actions: TryItAction["type"][]): TryItState {
  return actions.reduce<TryItState>(
    (s, type) => reduce(s, { type }),
    INITIAL_STATE,
  );
}

describe("tryItReducer", () => {
  it("starts untouched with the sample order on the board", () => {
    expect(INITIAL_STATE).toEqual({ taken: false, qty: 0, stage: "menu" });
    expect(phaseOf(INITIAL_STATE)).toBe("preparing");
    expect(ticketOf(INITIAL_STATE)).toEqual({ name: "Ada", qty: 2 });
  });

  it("adds a kopi and takes over from scroll play on the first tap", () => {
    const s = run("add");
    expect(s).toEqual({ taken: true, qty: 1, stage: "menu" });
    expect(ticketOf(s)).toEqual({ name: "You", qty: 1 });
    expect(phaseOf(s)).toBe("none");
  });

  it("caps the quantity", () => {
    const s = Array.from({ length: MAX_KOPI + 3 }).reduce<TryItState>(
      (cur) => reduce(cur, { type: "add" }),
      INITIAL_STATE,
    );
    expect(s.qty).toBe(MAX_KOPI);
  });

  it("never goes below zero but still counts as a takeover", () => {
    const s = run("remove", "remove");
    expect(s.qty).toBe(0);
    expect(s.taken).toBe(true);
  });

  it("places only with items", () => {
    expect(run("place")).toEqual(INITIAL_STATE);
    expect(run("remove", "place").stage).toBe("menu");
    const placed = run("add", "add", "place");
    expect(placed.stage).toBe("preparing");
    expect(placed.qty).toBe(2);
  });

  it("freezes the quantity once placed", () => {
    expect(run("add", "place", "add", "remove").qty).toBe(1);
  });

  it("moves ready then picked up, in order", () => {
    expect(run("add", "place", "ready").stage).toBe("ready");
    expect(run("add", "place", "ready", "pickedUp").stage).toBe("done");
    expect(run("add", "place", "pickedUp").stage).toBe("preparing");
    expect(run("add", "ready").stage).toBe("menu");
  });

  it("lets the untouched visitor mark the sample ready and picked up", () => {
    const ready = run("ready");
    expect(ready.stage).toBe("ready");
    expect(ready.taken).toBe(false);
    expect(phaseOf(run("ready", "pickedUp"))).toBe("done");
  });

  it("discards sample progress when the visitor takes over", () => {
    expect(run("ready", "add")).toEqual({
      taken: true,
      qty: 1,
      stage: "menu",
    });
  });

  it("resets everything, including the takeover flag", () => {
    expect(run("add", "place", "ready", "pickedUp", "reset")).toEqual(
      INITIAL_STATE,
    );
  });

  it("announces only once the order has moved", () => {
    expect(announcement(INITIAL_STATE)).toBe("");
    expect(announcement(run("add"))).toBe("");
    expect(announcement(run("add", "place"))).toMatch(/placed/);
    expect(announcement(run("add", "place", "ready"))).toMatch(/ready/);
    expect(announcement(run("add", "place", "ready", "pickedUp"))).toMatch(
      /picked up/,
    );
  });
});
