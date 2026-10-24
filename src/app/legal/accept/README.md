# accept

## Purpose

The legal-acceptance interstitial a signed-in vendor is redirected to when
their accepted terms/privacy versions are behind `@merqo/ui`'s
`LEGAL_VERSIONS`. qkit owns no acceptance record — merqo does — so this
folder's job is entirely to collect the vendor's consent and forward it.

## Contents

- `page.tsx` — `LegalAcceptPage`. Reads the `next` search param (through
  `safeRedirectPath`, `@merqo/ui`) and renders the client form.
  Deliberately runs no legal-gate check itself — it is what the gate
  redirects to, so gating it would loop.
- `accept-form.tsx` — `AcceptForm`, a client component wrapping `@merqo/ui`'s
  `TermsAcceptanceCheckbox` (just the agree checkbox, no typed name); the
  submit button stays disabled until it is checked. Posts to
  `acceptLegalTerms`.
- `actions.ts` — `acceptLegalTerms` server action. Re-checks for a signed-in
  user, records the acceptance against merqo, and redirects to the
  `next` path (again through `safeRedirectPath`, so a crafted `next` cannot
  turn this into an open redirect).
- `actions.test.ts` — covers both doc types inserting independently, the
  duplicate-insert tolerance, and the redirect target.

## Shared package note

`safeRedirectPath` comes from `@merqo/ui` (v0.31.0) rather than a
qkit-local `@/lib/safe-redirect`; it was duplicated in all five repos.

## Parent

[legal](../README.md)

The `next` form field is length-checked by Zod before `safeRedirectPath` runs.
