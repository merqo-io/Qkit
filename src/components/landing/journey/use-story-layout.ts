"use client";

import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";

const WIDE_QUERY = "(min-width: 960px)";

const PHONE = { w: 270, h: 580 };
const TABLET_WIDE = { w: 540, h: 430 };
const TABLET_NARROW = { w: 380, h: 520 };
const GAP = 24;
const LABEL = 28;
const CHROME_BELOW = 230;
const MIN_SCALE = 0.5;

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function snapshot() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia(WIDE_QUERY).matches
    : false;
}

/** True from 960px, where both screens sit side by side. False on the server. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * Scales the device pair to its column, and on a wide page also to the
 * viewport height so the sticky pair never outgrows the window. The devices
 * keep one design size and `zoom` shrinks them as a whole, which keeps the
 * real ticket markup at its real proportions instead of re-sizing each part.
 */
export function useFitScale(
  host: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  wide: boolean,
) {
  useLayoutEffect(() => {
    const hostEl = host.current;
    const targetEl = target.current;
    if (!hostEl || !targetEl) return;
    const designW = wide
      ? PHONE.w + GAP + TABLET_WIDE.w
      : Math.max(PHONE.w, TABLET_NARROW.w);
    const designH =
      Math.max(PHONE.h, wide ? TABLET_WIDE.h : TABLET_NARROW.h) + LABEL;
    const fit = () => {
      let scale = Math.min(1, hostEl.clientWidth / designW);
      if (wide) {
        scale = Math.min(scale, (window.innerHeight - CHROME_BELOW) / designH);
      }
      const next = Number.isFinite(scale) && scale > 0 ? scale : 1;
      targetEl.style.setProperty("zoom", String(Math.max(MIN_SCALE, next)));
    };
    fit();
    window.addEventListener("resize", fit);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(hostEl);
    return () => {
      window.removeEventListener("resize", fit);
      observer?.disconnect();
    };
  }, [host, target, wide]);
}
