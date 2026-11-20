"use client";

import { useSyncExternalStore } from "react";

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

/**
 * Tracks the OS reduced-motion setting live, so toggling it while the page is
 * open takes effect without a reload. False on the server.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
