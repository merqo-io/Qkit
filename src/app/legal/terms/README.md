# terms

## Purpose

The public terms-of-service page at `/legal/terms`. The text is not kept here: it lives in `@merqo/ui` so merqo and every kit publish one source.

## Contents

- `page.tsx` — `TermsPage`, a one-line Server Component rendering `@merqo/ui`'s `<LegalDocument doc="terms" kit="qkit" />`. The `kit` prop scopes the rendered Annex to qkit's own schedule only.

## Conventions

- Change the terms wording in `@merqo/ui`, not in this folder.
- No `loading.tsx`: the page is static and awaits nothing.

## Parent

[legal](../README.md)
