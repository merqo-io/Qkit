"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { z } from "zod";

export const SCREEN_SCALE_STEPS = [
  0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2,
] as const;

export const SCREEN_SCALE_KEYS = {
  display: "qkit:scale:display",
  board: "qkit:scale:board",
} as const;

export type ScreenScaleKey = keyof typeof SCREEN_SCALE_KEYS;

const DEFAULT_SCALE = 1;
const DEFAULT_INDEX = SCREEN_SCALE_STEPS.indexOf(DEFAULT_SCALE);

const storedScaleSchema = z
  .string()
  .transform((raw) => SCREEN_SCALE_STEPS.findIndex((s) => String(s) === raw))
  .refine((index) => index >= 0);

function readIndex(storageKey: string): number {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return DEFAULT_INDEX;
    const parsed = storedScaleSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_INDEX;
  } catch {
    return DEFAULT_INDEX;
  }
}

const listeners = new Set<() => void>();
const memory = new Map<string, number>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Only holds a choice storage refused, so a blocked-storage tab still obeys
// the buttons until it reloads.
function currentIndex(storageKey: string): number {
  return memory.get(storageKey) ?? readIndex(storageKey);
}

function writeIndex(storageKey: string, index: number): void {
  try {
    window.localStorage.setItem(storageKey, String(SCREEN_SCALE_STEPS[index]));
    memory.delete(storageKey);
  } catch {
    memory.set(storageKey, index);
  }
  listeners.forEach((l) => l());
}

/**
 * Per-screen text size, remembered on this device under its own key so the TV
 * display and the kitchen board can differ while browser zoom (shared by the
 * whole site) stays at 100%. Tailwind sizes are rem, which resolve against the
 * root element, so the scale is applied to the root font size while the screen
 * is mounted and restored on unmount. The stored value is read after mount so
 * the first render matches the server.
 */
export function useScreenScale(screen: ScreenScaleKey) {
  const storageKey = SCREEN_SCALE_KEYS[screen];
  const index = useSyncExternalStore(
    subscribe,
    () => currentIndex(storageKey),
    () => DEFAULT_INDEX,
  );

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = `${Math.round(SCREEN_SCALE_STEPS[index] * 100)}%`;
    return () => {
      root.style.fontSize = previous;
    };
  }, [index]);

  const change = useCallback(
    (next: number) => {
      const clamped = Math.min(
        SCREEN_SCALE_STEPS.length - 1,
        Math.max(0, next),
      );
      writeIndex(storageKey, clamped);
    },
    [storageKey],
  );

  return {
    scale: SCREEN_SCALE_STEPS[index],
    percent: Math.round(SCREEN_SCALE_STEPS[index] * 100),
    canDecrease: index > 0,
    canIncrease: index < SCREEN_SCALE_STEPS.length - 1,
    decrease: () => change(index - 1),
    increase: () => change(index + 1),
    reset: () => change(DEFAULT_INDEX),
  };
}
