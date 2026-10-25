import { isNil } from "@/lib/utils";
// Aggregate customer order feedback into the rating stats a vendor sees about
// their own booths.

export type ReviewRow = {
  rating: number | null;
  message: string | null;
  order_number: string | null;
  booth_id: string | null;
  created_at: string;
};

export type ReviewSummary = {
  // rated responses
  count: number;
  // mean rating (1 dp), null when none
  average: number | null;
  // Count per star 1..5.
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  // Most recent comments (rating optional), newest first.
  recent: ReviewRow[];
};

export function summarizeReviews(
  rows: ReviewRow[],
  recentLimit = 8,
): ReviewSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    if (
      r.rating !== null &&
      r.rating !== undefined &&
      r.rating >= 1 &&
      r.rating <= 5
    ) {
      distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
      sum += r.rating;
      count++;
    }
  }
  const average = count ? Math.round((sum / count) * 10) / 10 : null;

  const recent = [...rows]
    .filter((r) => r.message?.trim() || !isNil(r.rating))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, recentLimit);

  return { count, average, distribution, recent };
}

export type BoothReviews = {
  boothId: string;
  boothName: string;
  summary: ReviewSummary;
};

/**
 * Split reviews per booth so a vendor knows which booth each is for. Booths are
 * returned in the given order; a booth with no reviews is omitted. Rows whose
 * booth_id isn't in `booths` are ignored (shouldn't happen under RLS).
 */
export function groupReviewsByBooth(
  rows: ReviewRow[],
  booths: { id: string; name: string }[],
  recentLimit = 50,
): BoothReviews[] {
  const byBooth = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    if (!r.booth_id) continue;
    const list = byBooth.get(r.booth_id);
    if (list) list.push(r);
    else byBooth.set(r.booth_id, [r]);
  }
  const groups: BoothReviews[] = [];
  for (const booth of booths) {
    const list = byBooth.get(booth.id);
    if (!list || list.length === 0) continue;
    groups.push({
      boothId: booth.id,
      boothName: booth.name,
      summary: summarizeReviews(list, recentLimit),
    });
  }
  return groups;
}
