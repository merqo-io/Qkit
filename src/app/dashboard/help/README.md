# help

## Purpose

The vendor user guide at `/dashboard/help`. It lives inside the dashboard, not on the public site, so it can name plans and limits and stays out of search engines (`robots: { index: false }`). `src/proxy.ts` already sends a signed-out visitor to `/login`.

## Contents

- `page.tsx` — `HelpIndexPage()`: every category with its published articles (title and summary). A category with only drafts shows "Coming soon." rather than disappearing, rendered with `@merqo/ui`'s `EmptyState` at `size="compact"`.
- `[slug]/page.tsx` ([README](%5Bslug%5D/README.md)) — `HelpArticlePage({ params })`: one article (async `params`). A draft or unknown slug calls `notFound()`. `generateStaticParams` pre-renders the published slugs.
- `article-body.tsx` — `ArticleBody({ blocks })`: renders the `HelpBlock` union. Links starting with `/` use `next/link`; others open in a new tab.
- `help.dom.test.tsx` — index and article rendering, the draft 404 and the static params.

## Connectivity

Reads `@/content/help`, where the article text and the drift test live (see its README). Linked from the account menu's "User guide" item and the last orders-tour step (`dashboard-nav.tsx`, `components/tour/tour-steps.ts`) and from the landing page's FAQ.

## Parent

[dashboard](../README.md)
