import { describe, expect, it } from "vitest";
import {
  HELP_COMMENTS_SHOWN,
  helpFeedbackSchema,
  summarizeHelpFeedback,
} from "./feedback";

describe("helpFeedbackSchema", () => {
  it("accepts a Yes vote and a No vote with a trimmed comment", () => {
    expect(
      helpFeedbackSchema.parse({ slug: "payments", helpful: true }),
    ).toEqual({ slug: "payments", helpful: true, comment: undefined });
    expect(
      helpFeedbackSchema.parse({
        slug: "payments",
        helpful: false,
        comment: "  missing a step  ",
      }).comment,
    ).toBe("missing a step");
  });

  it("treats a blank comment as none", () => {
    expect(
      helpFeedbackSchema.parse({ slug: "a", helpful: false, comment: "   " })
        .comment,
    ).toBeUndefined();
  });

  it("rejects a comment on a Yes vote, an over-long comment and bad slugs", () => {
    expect(
      helpFeedbackSchema.safeParse({ slug: "a", helpful: true, comment: "x" })
        .success,
    ).toBe(false);
    expect(
      helpFeedbackSchema.safeParse({
        slug: "a",
        helpful: false,
        comment: "x".repeat(501),
      }).success,
    ).toBe(false);
    for (const slug of ["", "Bad Slug", "a/b", "-a", "a".repeat(101)]) {
      expect(
        helpFeedbackSchema.safeParse({ slug, helpful: true }).success,
      ).toBe(false);
    }
  });
});

describe("summarizeHelpFeedback", () => {
  const count = (slug: string, helpful: number, not_helpful: number) => ({
    article_slug: slug,
    helpful,
    not_helpful,
  });
  const comment = (slug: string, c: string | null, at: string) => ({
    article_slug: slug,
    comment: c,
    updated_at: at,
  });

  it("orders articles by No votes, then slug, and maps the counts", () => {
    const s = summarizeHelpFeedback(
      [count("z", 4, 1), count("b", 2, 3), count("a", 7, 1)],
      [],
    );
    expect(s.perArticle).toEqual([
      { slug: "b", helpful: 2, notHelpful: 3 },
      { slug: "a", helpful: 7, notHelpful: 1 },
      { slug: "z", helpful: 4, notHelpful: 1 },
    ]);
  });

  it("lists comments newest first and drops empty ones", () => {
    const s = summarizeHelpFeedback(
      [],
      [
        comment("b", "old", "2026-11-01T00:00:00Z"),
        comment("b", null, "2026-11-04T00:00:00Z"),
        comment("a", "new", "2026-11-03T00:00:00Z"),
        comment("c", "", "2026-11-05T00:00:00Z"),
      ],
    );
    expect(s.recentComments).toEqual([
      { slug: "a", comment: "new", at: "2026-11-03T00:00:00Z" },
      { slug: "b", comment: "old", at: "2026-11-01T00:00:00Z" },
    ]);
  });

  it("caps the comments at HELP_COMMENTS_SHOWN", () => {
    const many = Array.from({ length: HELP_COMMENTS_SHOWN + 3 }, (_, i) =>
      comment(
        "a",
        `c${i}`,
        `2026-11-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      ),
    );
    const s = summarizeHelpFeedback([], many);
    expect(s.recentComments).toHaveLength(HELP_COMMENTS_SHOWN);
    expect(s.recentComments[0].comment).toBe(`c${HELP_COMMENTS_SHOWN + 2}`);
  });
});
