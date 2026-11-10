# [slug]

## Purpose

One user-guide article at `/dashboard/help/<slug>`.

## Contents

- `page.tsx` — `HelpArticlePage({ params })` (async `params`): looks the slug up with `getPublishedArticle`, shows a back link, the category and the title, and renders the body through `ArticleBody` (`../article-body.tsx`). A draft or unknown slug calls `notFound()`. `generateStaticParams` pre-renders the published slugs, and `generateMetadata` titles the page `<article> | User guide`.

## Conventions

- Article text lives in `src/content/help`, never here.
- The route is not indexed; the parent `help/page.tsx` sets `robots`.

## Parent

[help](../README.md)
