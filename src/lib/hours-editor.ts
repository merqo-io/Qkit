import type { WeekdayKey } from "@/lib/tz";
import type { BoothHours, DayWindow } from "@/lib/hours";

// Pure state transitions behind the working-hours editor. Kept out of the
// component so the daily<->weekly conversions are unit-testable without a DOM.

const WEEKDAY_KEYS: WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export const DEFAULT_WINDOW: DayWindow = { open: "09:00", close: "17:00" };

export function emptyWeek(): Record<WeekdayKey, DayWindow | null> {
  return {
    mon: null,
    tue: null,
    wed: null,
    thu: null,
    fri: null,
    sat: null,
    sun: null,
  };
}

/**
 * Daily window -> BoothHours. Both ends present = a real window; either blank
 * = no restriction (null) so a half-typed time never persists a bad window.
 */
export function dailyHours(open: string, close: string): BoothHours {
  return open && close ? { mode: "daily", open, close } : null;
}

/**
 * Switching daily -> weekly: prefill every day with the current daily window
 * (or DEFAULT_WINDOW when daily was blank) so the vendor tweaks, not restarts.
 */
export function weekFromDaily(
  open: string,
  close: string,
): Record<WeekdayKey, DayWindow | null> {
  const win: DayWindow = open && close ? { open, close } : DEFAULT_WINDOW;
  return WEEKDAY_KEYS.reduce(
    (acc, key) => {
      acc[key] = win;
      return acc;
    },
    {} as Record<WeekdayKey, DayWindow | null>,
  );
}

/**
 * Switching weekly -> daily: collapse to the first set day's window, falling
 * back to the prior daily values when every day was closed.
 */
export function dailyFromWeek(
  days: Record<WeekdayKey, DayWindow | null>,
  fallbackOpen: string,
  fallbackClose: string,
): { open: string; close: string } {
  const first = WEEKDAY_KEYS.map((k) => days[k]).find(Boolean) ?? null;
  return {
    open: first?.open ?? fallbackOpen,
    close: first?.close ?? fallbackClose,
  };
}
