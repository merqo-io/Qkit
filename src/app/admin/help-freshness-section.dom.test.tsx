// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpFreshnessSection } from "./help-freshness-section";
import { staleHelpArticles } from "@/content/help/stale";
import type { HelpArticle } from "@/content/help";

const NOW = new Date("2026-11-03T12:00:00Z");

const article = (overrides: Partial<HelpArticle>): HelpArticle => ({
  slug: "a",
  category: "getting-started",
  title: "Alpha",
  summary: "s",
  reviewed: "2026-11-01",
  uiLabels: [],
  covers: [],
  body: [],
  ...overrides,
});

describe("staleHelpArticles", () => {
  it("lists articles past the threshold oldest first and skips drafts", () => {
    const result = staleHelpArticles(
      [
        article({ slug: "mid", reviewed: "2026-06-01" }),
        article({ slug: "old", reviewed: "2026-01-01" }),
        article({ slug: "fresh", reviewed: "2026-10-01" }),
        article({ slug: "draft", reviewed: "2025-01-01", draft: true }),
      ],
      NOW,
    );
    expect(result.map((r) => r.slug)).toEqual(["old", "mid"]);
    expect(result[0]?.ageDays).toBe(306);
  });

  it("treats exactly the threshold as fresh", () => {
    expect(
      staleHelpArticles([article({ reviewed: "2026-08-05" })], NOW),
    ).toEqual([]);
  });
});

describe("HelpFreshnessSection", () => {
  it("shows slug, title and age for a stale article", () => {
    render(
      <HelpFreshnessSection
        now={NOW}
        articles={[
          article({
            slug: "payments",
            title: "Payments",
            reviewed: "2026-06-01",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("payments")).toBeInTheDocument();
    expect(screen.getByText("155 days old")).toBeInTheDocument();
  });

  it("says so when nothing is stale", () => {
    render(
      <HelpFreshnessSection
        now={NOW}
        articles={[article({ reviewed: "2026-11-01" })]}
      />,
    );
    expect(
      screen.getByText(/reviewed in the last 90 days/),
    ).toBeInTheDocument();
  });
});
