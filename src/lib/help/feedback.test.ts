import { describe, expect, it } from "vitest";
import { helpFeedbackSchema, summarizeHelpFeedback } from "./feedback";

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
  const row = (
    slug: string,
    helpful: boolean,
    comment: string | null,
    at: string,
  ) => ({ article_slug: slug, helpful, comment, updated_at: at });

  it("counts per article, worst first, and lists the newest No comments", () => {
    const s = summarizeHelpFeedback([
      row("a", true, null, "2026-11-01T00:00:00Z"),
      row("b", false, "old", "2026-11-01T00:00:00Z"),
      row("b", false, "new", "2026-11-03T00:00:00Z"),
      row("b", false, null, "2026-11-04T00:00:00Z"),
    ]);
    expect(s.perArticle).toEqual([
      { slug: "b", helpful: 0, notHelpful: 3 },
      { slug: "a", helpful: 1, notHelpful: 0 },
    ]);
    expect(s.recentComments.map((c) => c.comment)).toEqual(["new", "old"]);
  });
});
