// qkit is Singapore-only, so every wall-clock decision (working hours, busiest
// hour) is made in Asia/Singapore — never the server's UTC or the customer's
// browser tz. Per-booth timezones are a future extension.
const BOOTH_TZ = "Asia/Singapore";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

// Canonical Monday-first weekday order + display labels — single source for the
// stats day×hour matrix (row 0 = Mon), the hours editor, and the heatmap axis,
// so their ordering can't drift and mislabel the grid.
export const WEEKDAY_ORDER: WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const WEEKDAY_MAP: Record<string, WeekdayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

// Options are constant, so build the formatter once. Intl.DateTimeFormat
// construction is comparatively expensive and sgtParts runs per order on the
// stats hot path.
const SGT_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BOOTH_TZ,
  // 00–23; avoids the "24:00" some engines emit at midnight
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

function sgtParts(iso: string): {
  hour: number;
  minute: number;
  weekday: WeekdayKey;
} {
  const map: Record<string, string> = {};
  for (const p of SGT_FORMAT.formatToParts(new Date(iso)))
    map[p.type] = p.value;
  return {
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAY_MAP[map.weekday] ?? "mon",
  };
}

/** Hour-of-day (0–23) of an ISO instant, in SGT. */
export function sgtHour(iso: string): number {
  return sgtParts(iso).hour;
}

/** Minutes since midnight (0–1439) of an ISO instant, in SGT. */
export function sgtMinutes(iso: string): number {
  const { hour, minute } = sgtParts(iso);
  return hour * 60 + minute;
}

/** Weekday key ("mon".."sun") of an ISO instant, in SGT. */
export function sgtWeekday(iso: string): WeekdayKey {
  return sgtParts(iso).weekday;
}

// Cached: short calendar date in SGT, e.g. "7 Jun" — used for chart axis ticks.
const SGT_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BOOTH_TZ,
  day: "numeric",
  month: "short",
});

/** Format an epoch-ms instant as a short SGT date like "7 Jun". */
export function shortDay(ms: number): string {
  return SGT_DAY_FORMAT.format(new Date(ms));
}

// Cached: wall-clock time in SGT, e.g. "2:38:05 AM" — for the order-card stamp.
const SGT_CLOCK_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BOOTH_TZ,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/**
 * Wall-clock time of an ISO instant in SGT, e.g. "2:38:05 AM". Always formats in
 * SGT (never the runtime's tz), so server and client agree — hydration-safe,
 * unlike a bare `toLocaleTimeString()`.
 */
export function sgtClock(iso: string): string {
  return SGT_CLOCK_FORMAT.format(new Date(iso));
}

// Cached: short weekday + time in SGT, e.g. "Mon, 02:30 pm" — for the pass
// countdown's "Pro until …" label.
const SGT_WEEKDAY_TIME_FORMAT = new Intl.DateTimeFormat("en-SG", {
  timeZone: BOOTH_TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Weekday + wall-clock time of an ISO instant in SGT, e.g. "Mon, 02:30 pm".
 * Fixed to SGT (not the runtime tz), so server and client agree — hydration-safe
 * unlike a bare `toLocaleString()`.
 */
export function sgtWeekdayTime(iso: string): string {
  return SGT_WEEKDAY_TIME_FORMAT.format(new Date(iso));
}

// Cached: short date + time in SGT, e.g. "7 Jun, 2:30 pm" — for review timestamps.
const SGT_DATETIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BOOTH_TZ,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Format an ISO instant as a short SGT date+time like "7 Jun, 2:30 pm". */
export function shortDateTime(iso: string): string {
  return SGT_DATETIME_FORMAT.format(new Date(iso));
}

// Cached: SGT calendar date as an ISO-sortable "YYYY-MM-DD" string — used to
// find the boundary of "today" in SGT regardless of the server's own tz.
const SGT_YMD_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOOTH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Start of "today" in SGT, as a UTC ISO instant — the boundary for any
 * same-calendar-day-in-SGT query (e.g. the daily order-number reset
 * baseline: "the booth's first order today"). SGT is a fixed UTC+8 with no
 * DST, so this is a plain offset subtraction, not a real timezone
 * conversion. `now` defaults to the current instant; pass one in for tests.
 */
export function sgtStartOfDayIso(now: Date = new Date()): string {
  const [y, m, d] = SGT_YMD_FORMAT.format(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000).toISOString();
}
