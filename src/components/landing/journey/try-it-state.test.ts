import { describe, expect, it } from "vitest";

import {
  CANON,
  INITIAL_STATE,
  STEP_OF,
  announcement,
  cuedScreen,
  focusOf,
  stepAfter,
  storyReducer,
  tabFlashes,
  tabSubtitle,
  type StoryAction,
  type StoryState,
} from "./try-it-state";

function run(actions: StoryAction[], from: StoryState = INITIAL_STATE) {
  return actions.reduce(storyReducer, from);
}

const place: StoryAction = { type: "act", act: "place", wide: false };
const start: StoryAction = { type: "act", act: "start", wide: false };

describe("step mapping", () => {
  it("maps stages to steps and steps to canonical stages", () => {
    expect(STEP_OF).toEqual([1, 2, 3, 3, 3]);
    expect(CANON).toEqual({ 1: 0, 2: 1, 3: 2 });
  });

  it("names the step each act lands on", () => {
    expect(stepAfter("place")).toBe(2);
    expect(stepAfter("start")).toBe(3);
    expect(stepAfter("replay")).toBe(1);
  });
});

describe("storyReducer", () => {
  it("refuses to place an empty order", () => {
    const empty = run([
      { type: "qty", key: "kopi", delta: -1 },
      { type: "qty", key: "kopi", delta: -1 },
      { type: "qty", key: "toast", delta: -1 },
    ]);
    expect(run([place], empty).stage).toBe(0);
  });

  it("jumps to step 3 when Start is tapped", () => {
    const s = run([place, start]);
    expect(s.stage).toBe(2);
    expect(STEP_OF[s.stage]).toBe(3);
  });

  it("ignores an act out of order", () => {
    expect(run([start]).stage).toBe(0);
  });

  it("keeps the phone screen on a narrow tap and follows the story when wide", () => {
    expect(run([place]).override).toBe("phone");
    expect(
      run([{ type: "act", act: "place", wide: true }]).override,
    ).toBeNull();
  });

  it("switches to the board when 2 Start is tapped with the phone showing", () => {
    const sent = run([place]);
    expect(focusOf(sent)).toBe("phone");
    const jumped = run([{ type: "go", step: 2 }], sent);
    expect(jumped.stage).toBe(1);
    expect(focusOf(jumped)).toBe("board");
  });

  it("clears a ready order to Collected on auto-clear only from ready", () => {
    const ready = run([
      place,
      start,
      { type: "act", act: "ready", wide: false },
    ]);
    expect(ready.stage).toBe(3);
    expect(run([{ type: "autoClear", wide: true }], ready).stage).toBe(4);
    expect(run([{ type: "autoClear", wide: true }]).stage).toBe(0);
  });

  it("replays from the end back to the menu", () => {
    const done = run([{ type: "settle" }]);
    expect(done.stage).toBe(4);
    expect(run([{ type: "act", act: "replay", wide: true }], done).stage).toBe(
      0,
    );
  });

  it("does not move on a scroll to the step already active", () => {
    const s = run([place, start]);
    expect(run([{ type: "scroll", step: 3 }], s)).toBe(s);
    expect(run([{ type: "scroll", step: 1 }], s).stage).toBe(0);
  });
});

describe("tab cues", () => {
  it("flashes the hidden screen when the next tap is on it", () => {
    const sent = run([place]);
    expect(cuedScreen(sent)).toBe("board");
    expect(tabSubtitle(sent, "board")).toBe("Tap to continue");
    expect(tabFlashes(sent, "board")).toBe(true);
    expect(announcement(sent)).toContain("Phone: Order sent");
  });

  it("does not cue once the order is collected", () => {
    expect(cuedScreen(run([{ type: "settle" }]))).toBeNull();
  });
});
