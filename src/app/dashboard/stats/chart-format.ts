// Shared formatting for the stats charts + KPI cards. Kept in one place so the
// trend / service-speed charts can't drift on range labels, and so the two
// wait renderings (compact axis vs readable KPI) live side by side.

/** Window label shown in a chart's eyebrow header. */
export const RANGE_LABEL: Record<string, string> = {
  "24h": "today and yesterday",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

/**
 * Human window caption for the KPI strip — answers "what am I looking at?" in
 * one glance. 24h reads "today and yesterday"; the per-event view says
 * "this event" (its window is the event, not a rolling range). Falls back to a
 * neutral phrase so an unknown range never renders a bare key.
 */
export function rangeCaption(range: string): string {
  switch (range) {
    case "24h":
      return "today and yesterday";
    case "7d":
      return "last 7 days";
    case "30d":
      return "last 30 days";
    case "90d":
      return "last 90 days";
    case "event":
      return "this event";
    default:
      return "recent activity";
  }
}

/**
 * Hour-of-day label. `long` → "9am" / "12pm" (KPI/axis copy); compact default →
 * "9a" / "12p" (tight heatmap cells).
 */
export function hourLabel(h: number, opts?: { long?: boolean }): string {
  const period = (h < 12 ? "a" : "p") + (opts?.long ? "m" : "");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

/** Compact wait — for chart axes + tooltips: "4.2m" / "45s". */
export function fmtWait(seconds: number): string {
  return seconds >= 60
    ? `${(seconds / 60).toFixed(1)}m`
    : `${Math.round(seconds)}s`;
}

/**
 * Readable wait — for KPI cards: "4m 12s" (or "12s" under a minute). Floors
 * minutes off the rounded total so it never over-rounds the minutes or shows a
 * "2m 60s" carry.
 */
export function waitClock(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
