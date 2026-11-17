// @vitest-environment jsdom
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("shows no price, em dash or readiness claim on any board", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\$/);
    expect(text).not.toMatch(/\u2014/);
    expect(text).not.toMatch(/\b(live|now|available today|proven)\b/i);
  });
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

  it("gives every dot a 44px hit area and keeps the 6px visual", async () => {
    mockMatchMedia(true);
    const { container } = render(<HeroPreviewCarousel />);
    const dots = container.querySelectorAll<HTMLElement>("[data-dot]");
    for (const dot of dots) {
      expect(dot).toHaveClass("size-11");
      expect(dot).toHaveAttribute("tabindex", "-1");
      expect(dot.firstElementChild).toHaveClass("size-1.5");
    }
  });

  it("moves the carousel when a dot is tapped by touch", async () => {
    mockMatchMedia(true);
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const user = userEvent.setup();
    const { container } = render(<HeroPreviewCarousel />);
    const dots = container.querySelectorAll<HTMLElement>("[data-dot]");
    await user.pointer({ keys: "[TouchA]", target: dots[2] });
    expect(scrollTo).toHaveBeenCalled();
  });
});
