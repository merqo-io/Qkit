# privacy

## Purpose

The public privacy-policy page at `/legal/privacy`. The text is not kept here: it lives in `@merqo/ui` so merqo and every kit publish one source.

## Contents

- `page.tsx` — `PrivacyPage`, a one-line Server Component rendering `@merqo/ui`'s `<LegalDocument doc="privacy" />`. The component brings its own prose container, so there is no local layout.

## Conventions

- Change the policy wording in `@merqo/ui`, not in this folder.
- No `loading.tsx`: the page is static and awaits nothing.

## Parent

[legal](../README.md)
