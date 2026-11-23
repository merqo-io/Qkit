import { z } from "zod";

export const HELP_COMMENT_MAX = 500;
export const HELP_COMMENTS_SHOWN = 5;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Shape of one "Was this helpful?" submission. Membership of the slug in the
 * published registry is checked by the caller, which owns the content import.
 * A comment is only collected on a "No" vote.
 */
export const helpFeedbackSchema = z
  .object({
    slug: z.string().min(1).max(100).regex(SLUG_RE),
    helpful: z.boolean(),
    comment: z
      .string()
      .trim()
      .max(HELP_COMMENT_MAX)
      .optional()
      .transform((c) => (c ? c : undefined)),
  })
  .refine((v) => v.helpful === false || v.comment === undefined, {
    path: ["comment"],
    message: "A comment is only accepted with a No vote",
  });

export type HelpFeedbackInput = z.input<typeof helpFeedbackSchema>;

export type HelpFeedbackResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "unauthenticated" | "failed";
    };

export type HelpVote = { helpful: boolean; comment: string | null };

export type HelpFeedbackRow = {
  article_slug: string;
  helpful: boolean;
  comment: string | null;
  updated_at: string;
};

export type HelpFeedbackSummary = {
  perArticle: { slug: string; helpful: number; notHelpful: number }[];
  recentComments: { slug: string; comment: string; at: string }[];
};

/** Counts per article (most "No" votes first) plus the latest "No" comments. */
export function summarizeHelpFeedback(
  rows: readonly HelpFeedbackRow[],
): HelpFeedbackSummary {
  const counts = new Map<string, { helpful: number; notHelpful: number }>();
  for (const row of rows) {
    const c = counts.get(row.article_slug) ?? { helpful: 0, notHelpful: 0 };
    if (row.helpful) c.helpful += 1;
    else c.notHelpful += 1;
    counts.set(row.article_slug, c);
  }
  const perArticle = [...counts.entries()]
    .map(([slug, c]) => ({ slug, ...c }))
    .sort(
      (a, b) => b.notHelpful - a.notHelpful || a.slug.localeCompare(b.slug),
    );
  const recentComments = rows
    .filter((r) => !r.helpful && r.comment)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, HELP_COMMENTS_SHOWN)
    .map((r) => ({
      slug: r.article_slug,
      comment: r.comment as string,
      at: r.updated_at,
    }));
  return { perArticle, recentComments };
}
