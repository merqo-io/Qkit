# about

## Purpose

The public "Why Merqo" page — the origin story (the qkit
wedding-coffee-cart story), linked from the landing `Nav` and `Footer`.

## Contents

- `page.tsx` — `AboutPage`, an async Server Component. Reflects the
  session (same `createServerClient`/`getUser` pattern as `src/app/page.tsx`)
  so its `Nav` CTA reads "Dashboard" for a signed-in vendor and "Sign
  in"/"Get started" otherwise. The story itself is `@merqo/ui`'s shared
  `AboutMerqo` component (`kitName="qkit"`, one source reused by merqo's
  own `/about` and every other kit's) — this page supplies only
  `Nav`/`Footer` and a "See how qkit works" CTA (`/#how`) as
  `AboutMerqo`'s `children`.
- `page.dom.test.tsx` — covers the origin-story copy, the `kitName`
  closing line, the CTA link, and the signed-in-vendor Dashboard link.

## Connectivity

Linked from `Nav` (`src/components/landing/`) and `SiteFooter` (`src/components/widgets/`) on both the
landing page and this one.

## Parent

[app](../README.md)
