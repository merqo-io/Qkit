# [slug]

## Purpose

One user-guide article at `/dashboard/help/<slug>`.

## Contents

- `page.tsx` — `HelpArticlePage({ params })` (async `params`): looks the slug up with `getPublishedArticle`, shows a breadcrumb (Help / category / title), the body through `ArticleBody` (`../article-body.tsx`), previous/next links in global sidebar order (`orderedArticles`) and, from `xl`, an "On this page" TOC of level-2 headings. A draft or unknown slug calls `notFound()`. `generateStaticParams` pre-renders the published slugs, and `generateMetadata` titles the page `<article> | User guide`.

## Conventions

- Article text lives in `src/content/help`, never here.
- The route is not indexed; the parent `help/page.tsx` sets `robots`.

## Parent

[help](../README.md)
