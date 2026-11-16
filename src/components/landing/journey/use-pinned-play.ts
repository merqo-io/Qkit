"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { progressToStep, usePrefersReducedMotion } from "@merqo/ui";
import { pinFits, pinnedProgress } from "./pinned-progress";

/**
 * Gap kept under the sticky site nav, matching the `scroll-mt-20` the page
 * uses for anchors.
 */
export const PIN_NAV_OFFSET_PX = 80;

const PIN_TOP_CSS = "5rem";

/**
 * The shortest the screen can be (toolbars showing), in px. `innerHeight` grows
 * as a phone toolbar retracts during a scroll, which would flip the pin on and
 * off mid-gesture; a probe sized in `svh` does not move. Falls back to
 * `innerHeight` where the probe measures nothing (no layout).
 */
function smallViewportHeight(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;height:100svh";
  document.body.appendChild(probe);
  const h = probe.offsetHeight;
  probe.remove();
  return h > 0 ? h : window.innerHeight;
}

/**
 * Runs a spacer resize with the browser's scroll anchoring off for the
 * document. A per-element `overflow-anchor: none` would not help: anchoring
 * picks a node below the spacer and still shifts the page when the spacer
 * above it changes height. Chrome and Firefox would then add their own
 * adjustment to our manual `scrollBy` and the page would jump twice; Safari has
 * no anchoring and relies on the manual one alone. Layout is forced before the
 * property is restored, so the adjustment cannot happen afterwards.
 */
function withoutAnchoring(resize: () => void) {
  const root = document.documentElement;
  const previous = root.style.overflowAnchor;
  root.style.overflowAnchor = "none";
  resize();
  root.getBoundingClientRect();
  root.style.overflowAnchor = previous;
}

/**
 * Scroll position as a play head for a pinned panel. The hook owns the refs it
 * returns: `track` wraps the sticky `panel` and a tall `spacer` that supplies
 * the scroll distance. Also returns the step (0 to `steps`) and whether a pin
 * is wanted.
 *
 * The sticky `top` is written straight to the panel in the same measurement
 * that reads it back, so progress always agrees with where the browser sticks
 * the panel; a `ResizeObserver` on the panel re-measures when fonts load or
 * text rewraps. While `driven` is false (the visitor's taps run the demo) the
 * spacer is cut to the distance already scrolled, which leaves the panel where
 * it is and removes the stretch of scrolling where nothing would change; it
 * is restored only once it is entirely off screen, compensating the scroll
 * position when it sits above the viewport so nothing on screen moves. A
 * takeover at the very top of the track cuts the spacer to about zero, which
 * is fine: nothing on screen moves and no dead scroll remains.
 * The pin top is a fixed 5rem. A panel that cannot fit between that and the
 * bottom of the shortest viewport (under about 530px of height for chapter 1,
 * after its own tightening) is not pinned at all: it reports the finished step
 * and no spacer, as pinning it would hide its heading under the nav or its
 * controls below the fold. Reduced motion has no pin and no scroll play, and
 * reports step 0. Server render and no-JS report the finished step.
 */
export function usePinnedPlay(
  steps: number,
  driven: boolean,
): {
  track: RefObject<HTMLDivElement | null>;
  panel: RefObject<HTMLDivElement | null>;
  spacer: RefObject<HTMLDivElement | null>;
  step: number;
  pinned: boolean;
} {
  const track = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(steps);
  const [fits, setFits] = useState(true);
  const shortened = useRef(false);

  useLayoutEffect(() => {
    if (reduced || driven) return;
    const t = track.current;
    const p = panel.current;
    const s = spacer.current;
    if (!t || !p || !s || shortened.current) return;
    const resolved = parseFloat(getComputedStyle(p).top);
    const pinTop = Number.isFinite(resolved) ? resolved : PIN_NAV_OFFSET_PX;
    const scrolled = pinTop - t.getBoundingClientRect().top;
    if (scrolled >= s.offsetHeight - 1) return;
    withoutAnchoring(() => {
      s.style.height = `${Math.max(scrolled, 0)}px`;
    });
    shortened.current = true;
  }, [reduced, driven]);

  useEffect(() => {
    if (reduced || !driven) return;
    let queued = false;
    let frame = 0;
    let lastTop = "";

    const restoreSpacer = (s: HTMLElement) => {
      const rect = s.getBoundingClientRect();
      const offscreenBelow = rect.top >= window.innerHeight;
      const offscreenAbove = rect.bottom <= 0;
      if (!offscreenBelow && !offscreenAbove) return;
      const before = s.offsetHeight;
      withoutAnchoring(() => {
        s.style.height = "";
        shortened.current = false;
        if (offscreenAbove) window.scrollBy(0, s.offsetHeight - before);
      });
    };

    const measure = () => {
      queued = false;
      const t = track.current;
      const p = panel.current;
      const s = spacer.current;
      if (!t || !p) return;
      const panelHeight = p.offsetHeight;
      const canPin = pinFits({
        panelHeight,
        viewportHeight: smallViewportHeight(),
        pinTop: PIN_NAV_OFFSET_PX,
      });
      setFits(canPin);
      if (!canPin) {
        shortened.current = false;
        setStep(steps);
        return;
      }
      if (!s) return;
      if (shortened.current) restoreSpacer(s);
      if (PIN_TOP_CSS !== lastTop) {
        p.style.top = PIN_TOP_CSS;
        lastTop = PIN_TOP_CSS;
      }
      if (shortened.current) {
        setStep(steps);
        return;
      }
      const resolved = parseFloat(getComputedStyle(p).top);
      const progress = pinnedProgress({
        trackTop: t.getBoundingClientRect().top,
        trackHeight: t.offsetHeight,
        panelHeight,
        pinTop: Number.isFinite(resolved) ? resolved : PIN_NAV_OFFSET_PX,
      });
      setStep(progressToStep(progress, steps));
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    if (panel.current) ro?.observe(panel.current);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [reduced, driven, steps]);

  if (reduced) return { track, panel, spacer, step: 0, pinned: false };
  return fits
    ? { track, panel, spacer, step, pinned: true }
    : { track, panel, spacer, step: steps, pinned: false };
}
