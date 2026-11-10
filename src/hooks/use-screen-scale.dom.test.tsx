// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SCREEN_SCALE_KEYS,
  SCREEN_SCALE_STEPS,
  useScreenScale,
} from "./use-screen-scale";

describe("useScreenScale", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.style.fontSize = "";
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 1 and leaves the root font size at 100%", () => {
    const { result } = renderHook(() => useScreenScale("board"));
    expect(result.current.percent).toBe(100);
    expect(document.documentElement.style.fontSize).toBe("100%");
  });

  it("steps up and down and applies the root font size", () => {
    const { result } = renderHook(() => useScreenScale("board"));
    act(() => result.current.increase());
    expect(result.current.percent).toBe(115);
    expect(document.documentElement.style.fontSize).toBe("115%");
    act(() => result.current.decrease());
    act(() => result.current.decrease());
    expect(result.current.percent).toBe(90);
  });

  it("clamps at both ends", () => {
    const { result } = renderHook(() => useScreenScale("board"));
    for (let i = 0; i < SCREEN_SCALE_STEPS.length + 2; i++) {
      act(() => result.current.increase());
    }
    expect(result.current.percent).toBe(200);
    expect(result.current.canIncrease).toBe(false);
    for (let i = 0; i < SCREEN_SCALE_STEPS.length + 2; i++) {
      act(() => result.current.decrease());
    }
    expect(result.current.percent).toBe(75);
    expect(result.current.canDecrease).toBe(false);
  });

  it("resets to 1", () => {
    const { result } = renderHook(() => useScreenScale("board"));
    act(() => result.current.increase());
    act(() => result.current.reset());
    expect(result.current.percent).toBe(100);
    expect(window.localStorage.getItem(SCREEN_SCALE_KEYS.board)).toBe("1");
  });

  it("restores the stored value after a remount", () => {
    const first = renderHook(() => useScreenScale("display"));
    act(() => first.result.current.increase());
    act(() => first.result.current.increase());
    first.unmount();
    const second = renderHook(() => useScreenScale("display"));
    expect(second.result.current.percent).toBe(130);
  });

  it("restores the root font size on unmount", () => {
    document.documentElement.style.fontSize = "16px";
    const { result, unmount } = renderHook(() => useScreenScale("board"));
    act(() => result.current.increase());
    unmount();
    expect(document.documentElement.style.fontSize).toBe("16px");
  });

  it.each(["abc", "3", "1.2", "", "NaN", "-1"])(
    "falls back to 1 for the stored value %j",
    (bad) => {
      window.localStorage.setItem(SCREEN_SCALE_KEYS.board, bad);
      const { result } = renderHook(() => useScreenScale("board"));
      expect(result.current.percent).toBe(100);
    },
  );

  it("keeps the two screens independent", () => {
    const display = renderHook(() => useScreenScale("display"));
    act(() => display.result.current.increase());
    expect(window.localStorage.getItem(SCREEN_SCALE_KEYS.display)).toBe("1.15");
    expect(window.localStorage.getItem(SCREEN_SCALE_KEYS.board)).toBeNull();
    display.unmount();
    const board = renderHook(() => useScreenScale("board"));
    expect(board.result.current.percent).toBe(100);
  });

  it("still works when storage throws", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      const { result } = renderHook(() => useScreenScale("board"));
      act(() => result.current.increase());
      expect(result.current.percent).toBe(115);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
