import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_HELP_ARTICLES,
  HELP_CATEGORIES,
  articlesInCategory,
  getPublishedArticle,
  publishedArticles,
  type HelpArticle,
  type HelpBlock,
} from "./index";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");
const HELP_DIR = path.join(SRC, "content", "help");
const SOURCE_EXT = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;
const EM_DASH = "—";

function collectSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (full === HELP_DIR) continue;
    if (statSync(full).isDirectory()) collectSources(full, out);
    else if (SOURCE_EXT.test(name) && !TEST_FILE.test(name)) out.push(full);
  }
  return out;
}

const sourceText = collectSources(SRC)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

function blockStrings(block: HelpBlock): string[] {
  switch (block.type) {
    case "steps":
    case "bullets":
      return block.items;
    case "link":
      return [block.text, block.href];
    default:
      return [block.text];
  }
}

function articleStrings(article: HelpArticle): string[] {
  return [
    article.title,
    article.summary,
    ...article.uiLabels,
    ...article.body.flatMap(blockStrings),
  ];
}

describe("help content drift", () => {
  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))(
    "%s quotes only UI strings that still exist in src/",
    (_slug, article) => {
      const missing = article.uiLabels.filter(
        (label) => !sourceText.includes(label),
      );
      const quoted = missing.map((m) => JSON.stringify(m)).join(", ");
      expect(
        missing,
        `Help article "${article.slug}" quotes UI text no longer found in src/: ${quoted}`,
      ).toEqual([]);
    },
  );

  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))(
    "%s covers source paths that exist",
    (_slug, article) => {
      const missing = article.covers.filter(
        (rel) => !existsSync(path.join(ROOT, rel)),
      );
      expect(
        missing,
        `Help article "${article.slug}" covers paths that no longer exist: ${missing.join(", ")}`,
      ).toEqual([]);
    },
  );

  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))(
    "%s has a valid review date",
    (_slug, article) => {
      const valid =
        /^\d{4}-\d{2}-\d{2}$/.test(article.reviewed) &&
        new Date(`${article.reviewed}T00:00:00Z`)
          .toISOString()
          .startsWith(article.reviewed);
      expect(
        valid,
        `Help article "${article.slug}" has an invalid reviewed date: "${article.reviewed}"`,
      ).toBe(true);
    },
  );

  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))(
    "%s has no em dash in any string",
    (_slug, article) => {
      const offending = articleStrings(article).filter((s) =>
        s.includes(EM_DASH),
      );
      expect(
        offending,
        `Help article "${article.slug}" contains an em dash in: ${offending.join(" | ")}`,
      ).toEqual([]);
    },
  );

  it.each(ALL_HELP_ARTICLES.map((a) => [a.slug, a] as const))(
    "%s is a finished article or a hidden draft",
    (_slug, article) => {
      if (!article.draft) expect(article.body.length).toBeGreaterThan(0);
    },
  );

  it("uses each slug once", () => {
    const slugs = ALL_HELP_ARTICLES.map((a) => a.slug);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(dupes, `Duplicate help slugs: ${dupes.join(", ")}`).toEqual([]);
  });

  it("gives every category at least one article, drafts included", () => {
    const empty = HELP_CATEGORIES.filter(
      (c) => !ALL_HELP_ARTICLES.some((a) => a.category === c.id),
    ).map((c) => c.id);
    expect(
      empty,
      `Help categories with no article: ${empty.join(", ")}`,
    ).toEqual([]);
  });

  it("hides drafts from the index and from lookup", () => {
    for (const article of ALL_HELP_ARTICLES.filter((a) => a.draft)) {
      expect(publishedArticles()).not.toContain(article);
      expect(getPublishedArticle(article.slug)).toBeUndefined();
      expect(articlesInCategory(article.category)).not.toContain(article);
    }
  });

  it("publishes the troubleshooting article", () => {
    expect(getPublishedArticle("troubleshooting")?.category).toBe(
      "troubleshooting",
    );
  });
});
