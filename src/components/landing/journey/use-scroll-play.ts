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
 * How far through a section the viewport has travelled, 0 to 1. Starts when
 * the section's top reaches 90% of the viewport and ends when three quarters
 * of its height plus 30% of the viewport have passed.
 */
export function scrollProgress(
  rect: { top: number; height: number },
  viewportHeight: number,
): number {
  const p =
    (viewportHeight * 0.9 - rect.top) /
    (rect.height * 0.75 + viewportHeight * 0.3);
  return Math.max(0, Math.min(1, p));
}

/** Splits 0..1 into `steps + 1` equal bands: 0 is "nothing yet", `steps` is complete. */
export function progressToStep(progress: number, steps: number): number {
  return Math.min(steps, Math.floor(progress * (steps + 1)));
}

/**
 * Scroll position as a play head: returns a step from 0 to `steps` that
 * rises as the element scrolls into view and falls back when scrolled up.
 * Server render, no-JS, a section already on screen at mount, and reduced
 * motion all show `steps`, the finished state. Only a section below the
 * viewport at mount drops to its measured step before the visitor reaches it.
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
    const measure = () => {
      queued = false;
      const el = ref.current;
      if (!el) return;
      setStep(
        progressToStep(
          scrollProgress(el.getBoundingClientRect(), window.innerHeight),
          steps,
        ),
      );
    };
    // A section already on screen keeps its finished state until the visitor
    // scrolls, so nothing visible snaps back to step 0 after hydration.
    const first = ref.current?.getBoundingClientRect();
    if (first && first.top >= window.innerHeight) measure();
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
