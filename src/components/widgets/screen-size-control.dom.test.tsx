// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SCREEN_SCALE_KEYS } from "@/hooks/use-screen-scale";
import { ScreenSizeControl } from "./screen-size-control";

describe("ScreenSizeControl", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("grows, shrinks and resets, remembering the choice per screen", () => {
    render(<ScreenSizeControl screen="board" />);
    expect(
      screen.getByRole("button", { name: "Reset text size" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Larger text" }));
    expect(
      screen.getByRole("button", { name: "Reset text size" }).textContent,
    ).toBe("115%");
    expect(window.localStorage.getItem(SCREEN_SCALE_KEYS.board)).toBe("1.15");
    expect(window.localStorage.getItem(SCREEN_SCALE_KEYS.display)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Smaller text" }));
    fireEvent.click(screen.getByRole("button", { name: "Smaller text" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset text size" }));
    expect(window.localStorage.getItem(SCREEN_SCALE_KEYS.board)).toBe("1");
  });
});
