# terms

## Purpose

The public terms-of-service page at `/legal/terms`. The text is not kept here: it lives in `@merqo/ui` so merqo and every kit publish one source.

## Contents

- `page.tsx` — `TermsPage`, a Server Component rendering `../legal-page-client.tsx`'s `LegalPageClient` (`@merqo/ui`'s `LegalPage` with the shared `LegalWordmark` and `next/link`) for `doc="terms" kit="qkit"`, and exporting `legalPageMetadata("terms")` as its `metadata`. The `kit` prop scopes the rendered Annex to qkit's own schedule only.

## Conventions

- Change the terms wording in `@merqo/ui`, not in this folder.
- No `loading.tsx`: the page is static and awaits nothing.

## Parent

[legal](../README.md)
