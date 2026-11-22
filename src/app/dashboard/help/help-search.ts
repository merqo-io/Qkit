import type { HelpSearchEntry } from "@/content/help";

export type HelpSearchResult = {
  slug: string;
  title: string;
  category: string;
  snippet: string;
};

export const MAX_RESULTS = 8;
const SNIPPET_RADIUS = 60;

function termsOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function snippetFor(entry: HelpSearchEntry, terms: string[]): string {
  const lower = entry.text.toLowerCase();
  const at = terms
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (at === undefined) return entry.summary;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(entry.text.length, at + SNIPPET_RADIUS);
  const body = entry.text.slice(start, end).trim();
  return `${start > 0 ? "..." : ""}${body}${end < entry.text.length ? "..." : ""}`;
}

function scoreEntry(entry: HelpSearchEntry, terms: string[]): number | null {
  const title = entry.title.toLowerCase();
  const summary = entry.summary.toLowerCase();
  const text = entry.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inTitle = title.includes(term);
    const inSummary = summary.includes(term);
    const inText = text.includes(term);
    if (!inTitle && !inSummary && !inText) return null;
    score += (inTitle ? 100 : 0) + (inSummary ? 10 : 0) + (inText ? 1 : 0);
  }
  return score;
}

/** Every word must appear somewhere; a title hit outranks a summary hit, which outranks a body hit. */
export function searchHelp(
  index: readonly HelpSearchEntry[],
  query: string,
): HelpSearchResult[] {
  const terms = termsOf(query);
  if (terms.length === 0) return [];
  return index
    .flatMap((entry) => {
      const score = scoreEntry(entry, terms);
      return score === null ? [] : [{ entry, score }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ entry }) => ({
      slug: entry.slug,
      title: entry.title,
      category: entry.category,
      snippet: snippetFor(entry, terms),
    }));
}
