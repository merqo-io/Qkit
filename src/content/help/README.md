# help

## Purpose

The text of the vendor user guide, one typed module per article. Rendered by `src/app/dashboard/help`. Kept here, away from the route, so an article change never touches UI code, and checked by a drift test so the guide cannot quietly describe a screen that has changed.

## Contents

- `types.ts` — `HelpArticle`, `HelpBlock` (heading, paragraph, steps, bullets, note, tip, link), `HelpCategory` and the `HelpCategoryId` union.
- `categories.ts` — the eight categories in display order.
- `index.ts` — registers every article and exposes `publishedArticles`, `articlesInCategory`, `getPublishedArticle` (a draft returns `undefined`, so its page 404s) and `categoryFor`.
- `<category>/<slug>.ts` — one article each, exporting `article`. Articles that are not written yet are `draft: true` with an empty body: hidden from the index and a 404 on their page.
- `source-text.ts` — turns source into what a user could see: strips comments and decodes JSX/HTML entities, for the drift test.
- `stale.ts` — `staleHelpArticles` and `HELP_STALE_AFTER_DAYS` (90): published articles whose `reviewed` date is past the threshold, oldest first. Shown on the admin dashboard (`src/app/admin/help-freshness-section.tsx`).
- `help-content.test.ts` — the drift test.

## Keeping articles current

- On commit, `.husky/lib/help-coupling.sh` reads each article's `covers` list and prints a non-blocking note naming the articles whose covered files are staged. Re-check them and bump `reviewed`.
- The admin dashboard lists articles not reviewed for over 90 days.

## Adding or finishing an article

1. Create or open `<category>/<slug>.ts`. Fill `body`, set `reviewed` to today, and remove `draft`.
2. List every UI string the body quotes in `uiLabels`, exactly as the screen shows it. Pick strings that sit on one line in a `.ts`/`.tsx` file and avoid apostrophes in JSX text (they are written `&apos;` there).
3. List the source files the article describes in `covers`, repo-relative.
4. Register a new file in `index.ts`.
5. Keep help to what the vendor sees in qkit. Payment and printing set-up belong to paykit and printkit: link out with a `link` block.

No em dash in any article string.

## What the drift test checks

For every article, drafts included:

- every `uiLabels` entry appears verbatim in some `.ts`/`.tsx` file under `src/` (this folder and test files excluded) after comments are removed and entities such as `&amp;` are decoded, so a renamed button fails the test and names the article and label;
- every `covers` path exists;
- `reviewed` is a real `YYYY-MM-DD` date;
- no em dash in the title, summary, labels or body;
- a published article has a body.

Across the set: slugs are unique and every category has at least one article.

## Connectivity

Read by `src/app/dashboard/help/page.tsx` and `[slug]/page.tsx`. Has no runtime dependencies.

## Parent

[src](../../README.md)
