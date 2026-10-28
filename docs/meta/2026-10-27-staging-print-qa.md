# Staging print candidate rehearsal

Candidate: PR #261, `codex/payment-start-printing`. Application commits are
`8a25e58` and `f08d349`; this report changes no application behavior.

## Completed against staging services

- Google sign-in, vendor dashboard and customer QR menu loaded on the candidate preview.
- `QA-261-PAID-1027` (#001): no print job before confirmation, one queued afterwards. This first job timed out while the virtual printer was offline.
- `QA-261-START-1027` (#003): landed pending with no job; vendor Start queued one label. The staging virtual printer subsequently rendered the correct number and name, and Printkit history reported PRINTED.
- `QA-261-VPRINT-1027` (#004): while the virtual printer was running, no label or job before confirmation. Payment received generated one correctly rendered label and PRINTED status.
- All three synthetic orders completed Ready and Picked Up. Ready and pickup added no print jobs. No captured candidate console errors.
- The booth payment toggle was restored to enabled and verified by a fresh form read. No existing non-QA order was changed. The virtual-printer fixture was stopped afterwards.

## Staging branch promotion

The existing staging sync copies main to staging after production is updated.
That does not provide a pre-production release gate. For this rehearsal only,
fast-forward staging to this candidate before updating main. A fresh report
commit provides a new deployment revision so Vercel builds it with staging's
existing branch-scoped environment and domain, rather than reusing an already
built per-PR commit. No Vercel setting or database operation is required.

Do not force-push either branch or modify the sync workflow for this rehearsal.
Until the release is approved, staging intentionally stays ahead of main; an
unrelated main push can fail its existing fast-forward sync. The eventual
release must preserve the tested commits with a merge commit, so main contains
the staged revision and the normal sync can fast-forward again. Permanent
staging-before-production workflow changes remain a separate task.

## Still to verify on the staging hostname

- Customer payment claim does not print; vendor confirmation prints exactly once.
- Customer arrival leaves a non-payment order awaiting vendor Start.
- Duplicate recovery does not create additional jobs.
- Printkit printed/failed callbacks update the Qkit status mirror.

Virtual output is software verification. No physical printer test is claimed.
The owner confirmed migration 0107 is installed only in staging. Production
must remain unreleased until the owner applies that prerequisite there and
remaining release checks pass. Do not run Supabase commands or access credentials.
