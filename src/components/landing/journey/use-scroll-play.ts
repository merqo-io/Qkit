"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function snapshot() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * How far through its play band an element has travelled, 0 to 1. Starts when
 * a third of the element is visible at the bottom of the viewport and ends
 * halfway between "just fully visible" and "top at the viewport top", so the
 * last step lands while the whole element is still on screen. Measure the
 * element that shows the result, not a section whose copy sits above it.
 */
export function scrollProgress(
  rect: { top: number; height: number },
  viewportHeight: number,
): number {
  const start = viewportHeight - rect.height / 3;
  const end = Math.max(viewportHeight - rect.height, 0) / 2;
  const p = (start - rect.top) / Math.max(start - end, 1);
  return Math.max(0, Math.min(1, p));
}

/** Splits 0..1 into `steps + 1` equal bands: 0 is "nothing yet", `steps` is complete. */
export function progressToStep(progress: number, steps: number): number {
  return Math.min(steps, Math.floor(progress * (steps + 1)));
}

/**
 * Scroll position as a play head: returns a step from 0 to `steps` that
 * rises as the element scrolls into view and falls back when scrolled up.
 * Server render, no-JS, an element meaningfully on screen at mount (a third
 * visible or more), and reduced motion all show `steps`, the finished state.
 * An element held that way keeps it until it has fully left the bottom of the
 * viewport. An element below the viewport or peeking in by less than a third
 * at mount drops to its measured step at once and plays on scroll.
 */
export function useScrollPlay(
  ref: RefObject<HTMLElement | null>,
  steps: number,
): number {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(steps);

  useEffect(() => {
    if (reduced) return;
    let queued = false;
    let frame = 0;
    let held = false;
    const measure = () => {
      queued = false;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (held && rect.top < window.innerHeight) return;
      held = false;
      setStep(progressToStep(scrollProgress(rect, window.innerHeight), steps));
    };
    // An element meaningfully on screen at mount keeps its finished state,
    // even through later scrolls and resizes, until it leaves below the
    // viewport, so nothing visible snaps back after hydration. One that is
    // barely peeking in (no progress yet) takes its measured step at once, so
    // it shows the start of the play instead of a blank finished overlay.
    const first = ref.current?.getBoundingClientRect();
    if (first && scrollProgress(first, window.innerHeight) > 0) held = true;
    else measure();
    const schedule = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [reduced, ref, steps]);

  return reduced ? steps : step;
}
