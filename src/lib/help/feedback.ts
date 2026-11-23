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

export type HelpFeedbackCountRow = {
  article_slug: string;
  helpful: number;
  not_helpful: number;
};

export type HelpFeedbackCommentRow = {
  article_slug: string;
  comment: string | null;
  updated_at: string;
};

export type HelpFeedbackSummary = {
  perArticle: { slug: string; helpful: number; notHelpful: number }[];
  recentComments: { slug: string; comment: string; at: string }[];
};

/**
 * Maps the database's per-article counts and the latest "No" comment rows into
 * the admin panel's shape: most "No" votes first, newest comments first.
 */
export function summarizeHelpFeedback(
  counts: readonly HelpFeedbackCountRow[],
  comments: readonly HelpFeedbackCommentRow[],
): HelpFeedbackSummary {
  const perArticle = counts
    .map((c) => ({
      slug: c.article_slug,
      helpful: c.helpful,
      notHelpful: c.not_helpful,
    }))
    .sort(
      (a, b) => b.notHelpful - a.notHelpful || a.slug.localeCompare(b.slug),
    );
  const recentComments = comments
    .filter((r) => r.comment)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, HELP_COMMENTS_SHOWN)
    .map((r) => ({
      slug: r.article_slug,
      comment: r.comment as string,
      at: r.updated_at,
    }));
  return { perArticle, recentComments };
}
