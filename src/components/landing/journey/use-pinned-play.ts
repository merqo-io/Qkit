"use client";

import { useEffect, useState, type RefObject } from "react";

import { pinnedProgress } from "./pinned-progress";
import { progressToStep, usePrefersReducedMotion } from "@merqo/ui";

/**
 * Gap kept under the sticky site nav, matching the `scroll-mt-20` the page
 * uses for anchors.
 */
export const PIN_NAV_OFFSET_PX = 80;

/**
 * Scroll position as a play head for a pinned panel. `track` is the tall
 * block, `panel` the sticky element inside it. Returns the step (0 to
 * `steps`), whether a pin is wanted, and the measured panel height so the
 * caller can keep the panel's bottom on screen when it is taller than the
 * viewport. The pin point is read from the panel's resolved `top`, so the
 * progress agrees with where the browser actually sticks it. Reduced motion,
 * server render and no-JS report the finished step and no pin.
 */
export function usePinnedPlay(
  track: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  steps: number,
): { step: number; pinned: boolean; panelHeight: number } {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState({ step: steps, panelHeight: 0 });

  useEffect(() => {
    if (reduced) return;
    let queued = false;
    let frame = 0;
    const measure = () => {
      queued = false;
      const t = track.current;
      const p = panel.current;
      if (!t || !p) return;
      const panelHeight = p.offsetHeight;
      const resolved = parseFloat(getComputedStyle(p).top);
      const progress = pinnedProgress({
        trackTop: t.getBoundingClientRect().top,
        trackHeight: t.offsetHeight,
        panelHeight,
        pinTop: Number.isFinite(resolved) ? resolved : PIN_NAV_OFFSET_PX,
      });
      const step = progressToStep(progress, steps);
      setState((s) =>
        s.step === step && s.panelHeight === panelHeight
          ? s
          : { step, panelHeight },
      );
    };
    measure();
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
  }, [reduced, track, panel, steps]);

  return reduced
    ? { step: steps, pinned: false, panelHeight: 0 }
    : { step: state.step, pinned: true, panelHeight: state.panelHeight };
}
