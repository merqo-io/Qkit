// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroPreviewCarousel } from "./hero-preview-carousel";
import { LANDING_BOARDS } from "./landing-boards";

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

function dots() {
  return screen.getAllByRole("button", { name: /^Show sample/ });
}

function current() {
  return dots().findIndex((b) => b.getAttribute("aria-current") === "true");
}

function wait(ms: number) {
  act(() => void vi.advanceTimersByTime(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HeroPreviewCarousel", () => {
  it("is built from the real ticket parts: attention lines, actions and status", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(screen.getAllByText("Not paid yet").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Says paid. Check the payment").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Mark Picked Up").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("gives a closed ticket no footer and aligns it to the start", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    const closed = container.querySelector(".self-start");
    expect(closed).not.toBeNull();
    expect(closed?.textContent).toContain("Jun");
    expect(closed?.querySelector(".h-10")).toBeNull();
  });

  it("advances one board after 7 seconds", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(current()).toBe(0);
    wait(7000);
    expect(current()).toBe(1);
  });

  it("restarts the whole countdown on any interaction", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    const root = container.firstElementChild as HTMLElement;
    wait(6000);
    fireEvent.wheel(root);
    wait(6000);
    expect(current()).toBe(0);
    wait(1000);
    expect(current()).toBe(1);
    wait(5000);
    fireEvent.keyDown(root, { key: "ArrowRight" });
    wait(6999);
    expect(current()).toBe(1);
  });

  it("never moves two boards on one tick", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    wait(7001);
    expect(current()).toBe(1);
  });

  it("does not auto-advance with reduced motion", () => {
    mockMatchMedia(true);
    render(<HeroPreviewCarousel />);
    wait(30000);
    expect(current()).toBe(0);
  });

  it("jumps to a board from its dot", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    fireEvent.click(dots()[3]);
    expect(current()).toBe(3);
  });

  it("has one slide per sample board with a lead caption", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(screen.getAllByRole("group")).toHaveLength(LANDING_BOARDS.length);
    for (const board of LANDING_BOARDS)
      expect(screen.getByText(board.lead)).toBeInTheDocument();
  });
});
