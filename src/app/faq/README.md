# faq

## Purpose

The public `/faq` page: full answers for vendors beyond the three rows on the
landing page, in four groups (getting started, day to day, money and payment,
cost and pilot).

## Contents

- `page.tsx` - `FaqRoute`, an async Server Component. Same session-aware `Nav`
  and `SiteFooter` as `/about`; the body is `@merqo/ui`'s `FaqPage` with
  JSON-LD on and no `closing` line.
- `faq-content.ts` - the title, intro and `FAQ_GROUPS` copy. Copy rules: no
  prices or plan names, no em dash, no exclamation marks, no readiness claims.
- `page.dom.test.tsx` - covers the groups and rows, the paykit PayNow answer,
  no closing line, the JSON-LD, the nav and footer, and the copy rules.

## Connectivity

Linked from the landing `Nav` (`src/components/landing/`). `/faq` is in
`NONCE_PREFIXES` (`src/lib/nonce-prefixes.ts`) so it gets the nonce CSP.

## Parent

[app](../README.md)
