# legal

## Purpose

The public legal-document pages and the acceptance interstitial. Content lives
in `@merqo/ui` (one source, shared by merqo and every kit); qkit only routes to
it and, on `accept/`, records the vendor's acceptance with merqo.

## Contents

- `terms/page.tsx` ([README](terms/README.md)) — `TermsPage`, a one-line Server Component rendering
  `@merqo/ui`'s `<LegalDocument doc="terms" kit="qkit" />` (the component
  brings its own `mx-auto max-w-3xl` prose container, so there's no local
  layout). The `kit` prop scopes the rendered Annex to qkit's own schedule
  only, not every sibling kit's.
- `privacy/page.tsx` ([README](privacy/README.md)) — `PrivacyPage`, the same for `<LegalDocument doc="privacy" />`.
- `accept/page.tsx` — `LegalAcceptPage`. The interstitial
  `requireCurrentLegalAcceptance` (`@/lib/legal-gate`) redirects a signed-in
  vendor to when their accepted terms/privacy versions are behind
  `@merqo/ui`'s `LEGAL_VERSIONS`. Reads the `next` search param (through
  `safeRedirectPath`, `@merqo/ui`) and renders the client form.
  Deliberately runs **no** legal-gate check itself — it is what the gate
  redirects to, so gating it would loop.
- `accept/accept-form.tsx` — `AcceptForm`, a client component wrapping
  `@merqo/ui`'s `TermsAcceptanceCheckbox` (just the agree checkbox — no
  typed name); the submit button is disabled until it's checked. Posts to
  `acceptLegalTerms`.
- `accept/actions.ts` — `acceptLegalTerms` server action. Re-checks for a
  signed-in user (redirects to `/login` otherwise), reads the vendor's
  real `ip`/`user_agent` (via `headers()`/`clientIp`, since this action
  runs on the vendor's own browser submission), then `POST`s
  `/api/merqo/legal-accept` on merqo once per doc type (`terms`,
  `privacy`) — bearer-authed with `MERQO_CUSTOMER_SECRET`, `kit_slug:
"qkit"`, each body carrying the SHA-256 of that doc's
  `getLegalDocSource(docType, "qkit")` (qkit's own scoped schedule, not the
  full multi-kit annex). Each call is independent, and merqo maps a
  duplicate `(email, doc_type, doc_version)` to a success, so a conflict
  on one doc never blocks the other. On success it primes the local
  `legal_check_state` cache to `is_current = true` and redirects to a
  `safeRedirectPath`-checked `next` (default `/dashboard`).
- `accept/actions.test.ts` — covers the two independent posts (asserting
  `ip`/`user_agent` land in both bodies), the cache prime, `next`-param
  safety (absolute / protocol-relative rejected), the no-user and
  missing-secret branches, and a non-2xx throw.

## Connectivity

qkit owns no acceptance record — merqo does (`merqo.legal_acceptances`). The
gate that sends vendors here lives in `@/lib/legal-gate`
(`requireCurrentLegalAcceptance`), wired into `requireVendor` /
`requireEntitledVendor` and `dashboard/layout.tsx`. `terms/` and `privacy/` are
also linked from the landing footer (`@merqo/ui`'s `LegalFooterLinks` in
`src/app/page.tsx`).

## Parent

[app](../README.md)
