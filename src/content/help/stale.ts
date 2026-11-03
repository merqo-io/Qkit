import { MS_PER_DAY } from "@/lib/utils";
import type { HelpArticle } from "./types";

export const HELP_STALE_AFTER_DAYS = 90;

export type StaleHelpArticle = {
  slug: string;
  title: string;
  reviewed: string;
  ageDays: number;
};

/**
 * Published articles whose `reviewed` date is older than the threshold,
 * oldest first. Drafts are skipped because nobody can read them yet, and an
 * unparseable date is skipped because the drift test already rejects it.
 */
export function staleHelpArticles(
  articles: readonly HelpArticle[],
  now: Date,
  thresholdDays: number = HELP_STALE_AFTER_DAYS,
): StaleHelpArticle[] {
  const stale: StaleHelpArticle[] = [];
  for (const a of articles) {
    if (a.draft) continue;
    const reviewedAt = Date.parse(`${a.reviewed}T00:00:00Z`);
    if (Number.isNaN(reviewedAt)) continue;
    const ageDays = Math.floor((now.getTime() - reviewedAt) / MS_PER_DAY);
    if (ageDays > thresholdDays) {
      stale.push({
        slug: a.slug,
        title: a.title,
        reviewed: a.reviewed,
        ageDays,
      });
    }
  }
  return stale.sort((x, y) => y.ageDays - x.ageDays);
}
