// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  progressToStep,
  scrollProgress,
  useScrollPlay,
} from "./use-scroll-play";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

let top = 0;

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useScrollPlay(ref, 4);
  return (
    <div ref={ref} data-testid="probe">
      {step}
    </div>
  );
}

function scrollTo(nextTop: number) {
  top = nextTop;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  top = 2000;
  vi.stubGlobal("innerHeight", 1000);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top, height: 800 }) as DOMRect,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("progress helpers", () => {
  it("clamps progress to 0..1", () => {
    expect(scrollProgress({ top: 5000, height: 800 }, 1000)).toBe(0);
    expect(scrollProgress({ top: -5000, height: 800 }, 1000)).toBe(1);
  });
  it("splits progress into bands that end at the last step", () => {
    expect(progressToStep(0, 4)).toBe(0);
    expect(progressToStep(0.25, 4)).toBe(1);
    expect(progressToStep(0.5, 4)).toBe(2);
    expect(progressToStep(0.99, 4)).toBe(4);
    expect(progressToStep(1, 4)).toBe(4);
  });
});

describe("useScrollPlay", () => {
  it("maps scroll position to a step and rewinds on scroll up", () => {
    mockMatchMedia(false);
    render(<Probe />);
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveTextContent("0");
    scrollTo(-2000);
    expect(probe).toHaveTextContent("4");
    scrollTo(300);
    const mid = Number(probe.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(4);
    scrollTo(2000);
    expect(probe).toHaveTextContent("0");
  });

  it("keeps the finished step when the section is already on screen at mount", () => {
    mockMatchMedia(false);
    top = 300;
    render(<Probe />);
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveTextContent("4");
    scrollTo(2000);
    expect(probe).toHaveTextContent("0");
  });

  it("drops to the measured step at mount when the section is below the viewport", () => {
    mockMatchMedia(false);
    top = 1500;
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("0");
  });

  it("shows the finished step and ignores scroll under reduced motion", () => {
    mockMatchMedia(true);
    render(<Probe />);
    const probe = screen.getByTestId("probe");
    expect(probe).toHaveTextContent("4");
    scrollTo(2000);
    expect(probe).toHaveTextContent("4");
  });

  it("registers a passive scroll listener and removes it on unmount", () => {
    mockMatchMedia(false);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Probe />);
    const scrollCall = add.mock.calls.find(([name]) => name === "scroll");
    expect(scrollCall?.[2]).toEqual({ passive: true });
    unmount();
    expect(remove.mock.calls.some(([name]) => name === "scroll")).toBe(true);
  });
});
