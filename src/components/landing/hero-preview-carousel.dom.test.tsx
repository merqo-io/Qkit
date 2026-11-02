// @vitest-environment jsdom
import { render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroPreviewCarousel } from "./hero-preview-carousel";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HeroPreviewCarousel", () => {
  it("renders all 4 boards and 4 dots", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    expect(screen.getAllByText(/Sample orders/i)).toHaveLength(4);
    expect(container.querySelectorAll("[data-dot]")).toHaveLength(4);
  });
  it("does not auto-advance the active dot under reduced motion", () => {
    vi.useFakeTimers();
    mockMatchMedia(true);
    const { container } = render(<HeroPreviewCarousel />);
    const before = container.querySelector('[data-dot][data-active="true"]');
    expect(before).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(11_000);
    });
    const after = container.querySelector('[data-dot][data-active="true"]');
    expect(after).toBe(before);
  });
});
