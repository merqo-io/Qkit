# help

## Purpose

The vendor user guide at `/dashboard/help`. It lives inside the dashboard, not on the public site, so it can name plans and limits and stays out of search engines (`robots: { index: false }`). `src/proxy.ts` already sends a signed-out visitor to `/login`.

## Contents

- `layout.tsx` — `HelpLayout({ children })`: two columns on `lg+` (sticky sidebar, content). Builds the sidebar data and the search index on the server and passes them as plain props.
- `help-sidebar.tsx` — client `HelpSidebar`: "Help home" link, search, and the category/article nav with the current article marked `aria-current="page"`. Below `lg` the nav is a native "Browse topics" `<details>`.
- `help-search-box.tsx` — client `HelpSearch`: combobox/listbox search. `/` focuses it, arrows and Enter navigate, Esc clears. The empty state links to Troubleshooting.
- `help-search.ts` — pure `searchHelp(index, query)`: every word must match; title outranks summary outranks body.
- `page.tsx` — `HelpIndexPage()`: hero with large search, "Popular articles" (`POPULAR_HELP_SLUGS`) and a category card grid linking to each category's first article.
- `[slug]/page.tsx` ([README](%5Bslug%5D/README.md)) — `HelpArticlePage({ params })`: one article (async `params`) with breadcrumb, "On this page" TOC and previous/next links. A draft or unknown slug calls `notFound()`.
- `article-body.tsx` — `ArticleBody({ blocks })` renders the `HelpBlock` union and gives headings stable ids; `articleHeadings()` lists the level-2 ones for the TOC. Links starting with `/` use `next/link`; others open in a new tab.
- `help.dom.test.tsx` — sidebar, search, home, article, draft 404 and static params.

## Connectivity

Reads `@/content/help`, where the article text and the drift test live (see its README). Linked from the account menu's "User guide" item and the last orders-tour step (`dashboard-nav.tsx`, `components/tour/tour-steps.ts`) and from the landing page's FAQ.

## Parent

[dashboard](../README.md)
