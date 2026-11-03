import { sgtStartOfDayIso } from "@/lib/tz";

/**
 * The reference points a booth's daily display numbers rank against. `day` is
 * its first order_number since SGT midnight. `services` has one entry per
 * "Start new service" tapped today, ascending by `start`, each with the first
 * order_number placed from that start until the next one (null when none
 * was). Client-safe: no server imports, so the vendor board can pick a
 * baseline for a realtime order.
 */
export type ServiceBaseline = { start: string; baseline: string | null };
export type NumberingBaselines = {
  day: string | null;
  services: ServiceBaseline[];
};

/**
 * Which baseline an order's display number ranks against, chosen by when it
 * arrived: the latest restart at or before it the same SGT day, else
 * midnight's. An order from an earlier day has none and shows its permanent
 * number. Restarts and baselines are per window, so a later restart never
 * moves a number an earlier order already showed.
 */
export function baselineFor(
  createdAt: string | null | undefined,
  baselines: NumberingBaselines | null | undefined,
  dayStartIso: string = sgtStartOfDayIso(),
): string | null {
  if (!baselines || !createdAt) return null;
  const placed = Date.parse(createdAt);
  if (Number.isNaN(placed)) return null;
  if (placed < Date.parse(dayStartIso)) return null;
  const idx = windowIndex(
    baselines.services.map((s) => s.start),
    placed,
  );
  return idx >= 0 ? baselines.services[idx].baseline : baselines.day;
}

/** Index of the last start at or before `placedMs`, or -1 for the day window. */
function windowIndex(starts: string[], placedMs: number): number {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) {
    if (Date.parse(starts[i]) <= placedMs) idx = i;
  }
  return idx;
}

const lowerOf = (current: string | null, candidate: string) =>
  current === null || Number(candidate) < Number(current) ? candidate : current;

/**
 * Folds one order into a booth's baselines: the day window and the service
 * window it falls in. Shared by the server query and the board's live
 * fallback so the two cannot rank differently.
 */
export function accumulateBaseline(
  entry: NumberingBaselines,
  orderNumber: string,
  createdAt: string,
): void {
  entry.day = lowerOf(entry.day, orderNumber);
  const idx = windowIndex(
    entry.services.map((s) => s.start),
    Date.parse(createdAt),
  );
  if (idx >= 0)
    entry.services[idx].baseline = lowerOf(
      entry.services[idx].baseline,
      orderNumber,
    );
}

/** Restarts as empty service windows, deduped and ascending. */
export function emptyServices(starts: string[]): ServiceBaseline[] {
  const valid = starts.filter((s) => !Number.isNaN(Date.parse(s)));
  return [...new Set(valid.map((s) => new Date(s).toISOString()))]
    .sort()
    .map((start) => ({ start, baseline: null }));
}
