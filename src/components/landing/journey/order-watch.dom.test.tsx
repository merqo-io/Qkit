// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderWatch } from "./order-watch";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("OrderWatch pin", () => {
  it("shows the finished order with no pin and no tall track under reduced motion", () => {
    mockMatchMedia(true);
    const { container } = render(<OrderWatch />);
    expect(screen.getByText("ORDER PLACED")).toBeVisible();
    expect(container.querySelector("[data-pinned]")).toBeNull();
    expect(container.querySelector("[data-pin-track]")).toBeNull();
    expect(container.querySelector(".sticky")).toBeNull();
  });

  it("pins the step in a tall track otherwise and starts from the measured state", () => {
    mockMatchMedia(false);
    const { container } = render(<OrderWatch />);
    expect(container.querySelector("[data-pinned]")).toHaveClass("sticky");
    expect(container.querySelector("[data-pin-track]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // jsdom has no layout: zero-sized track reads as finished, never a stuck early state
    expect(screen.getByText("ORDER PLACED")).toBeVisible();
  });
});
