import { sgtStartOfDayIso } from "@/lib/tz";

/**
 * The two reference points a booth's daily display numbers rank against.
 * `day` is its first order_number since SGT midnight, `service` its first
 * since the later of midnight and "Start new service" (`serviceStart`). Either
 * is null when the booth had no order in that window. Client-safe: no server
 * imports, so the vendor board can pick a baseline for a realtime order.
 */
export type NumberingBaselines = {
  day: string | null;
  service: string | null;
  serviceStart: string;
};

/**
 * Which baseline an order's display number ranks against, chosen by when it
 * arrived. An order from after the latest restart uses the service baseline;
 * one from earlier the same SGT day uses the day baseline, which is the number
 * it showed before the restart; one from an earlier day has none and shows
 * its permanent number.
 *
 * Exact for one restart in a day. After several, orders from services before
 * the latest one still rank from SGT midnight, not from the restart they were
 * placed after; recording each restart would be needed to be exact.
 */
export function baselineFor(
  createdAt: string | null | undefined,
  baselines: NumberingBaselines | null | undefined,
  dayStartIso: string = sgtStartOfDayIso(),
): string | null {
  if (!baselines || !createdAt) return null;
  const placed = Date.parse(createdAt);
  if (Number.isNaN(placed)) return null;
  if (placed >= Date.parse(baselines.serviceStart)) return baselines.service;
  if (placed >= Date.parse(dayStartIso)) return baselines.day;
  return null;
}
