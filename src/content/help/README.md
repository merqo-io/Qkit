# help

## Purpose

The text of the vendor user guide, one typed module per article. Rendered by `src/app/dashboard/help`. Kept here, away from the route, so an article change never touches UI code, and checked by a drift test so the guide cannot quietly describe a screen that has changed.

## Contents

- `types.ts` — `HelpArticle`, `HelpBlock` (heading, paragraph, steps, bullets, note, tip, link), `HelpCategory` and the `HELP_CATEGORY_IDS` list.
- `categories.ts` — the eight categories in display order.
- `index.ts` — registers every article and exposes `publishedArticles`, `articlesInCategory`, `getPublishedArticle` (a draft returns `undefined`, so its page 404s) and `categoryFor`.
- `<category>/<slug>.ts` — one article each, exporting `article`. Articles that are not written yet are `draft: true` with an empty body: hidden from the index and a 404 on their page.
- `help-content.test.ts` — the drift test.

## Adding or finishing an article

1. Create or open `<category>/<slug>.ts`. Fill `body`, set `reviewed` to today, and remove `draft`.
2. List every UI string the body quotes in `uiLabels`, exactly as the screen shows it. Pick strings that sit on one line in a `.ts`/`.tsx` file and avoid apostrophes in JSX text (they are written `&apos;` there).
3. List the source files the article describes in `covers`, repo-relative.
4. Register a new file in `index.ts`.
5. Keep help to what the vendor sees in qkit. Payment and printing set-up belong to paykit and printkit: link out with a `link` block.

No em dash in any article string.

## What the drift test checks

For every article, drafts included:

- every `uiLabels` entry appears verbatim in some `.ts`/`.tsx` file under `src/` (this folder and test files excluded), so a renamed button fails the test and names the article and label;
- every `covers` path exists;
- `reviewed` is a real `YYYY-MM-DD` date;
- no em dash in the title, summary, labels or body;
- a published article has a body.

Across the set: slugs are unique and every category has at least one article.

## Connectivity

Read by `src/app/dashboard/help/page.tsx` and `[slug]/page.tsx`. Has no runtime dependencies.

## Parent

[src](../../README.md)
