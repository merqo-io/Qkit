# merqo

## Purpose

Endpoints the sibling Merqo product calls into: usage metrics reporting, vendor status lookup, per-vendor activity detail, vendor push-provisioning, the entitlement push and Event Pass usage. All six are machine-to-machine (no user session).

## Contents

- `entitlement/` - `POST` endpoint that caches the subscription entitlement Merqo pushes for a vendor (tier, founder flag, stats window, Event Pass window, expiry).
- `event-pass-usage/` - `GET` endpoint returning the cups a vendor sold in a time window (via `qkit.vendor_cups_between`), for Event Pass top-up settlement.
- `metrics/` - `GET` endpoint returning aggregate qkit usage metrics.
- `vendor-activity/` - `GET` endpoint returning one vendor's tier, admin-console health status, a handful of labeled metrics, and last-activity timestamp by email. Feeds merqo's `/admin/vendors/[email]` detail page.
- `vendor-provision/` - `POST` endpoint that creates a `vendors` row (and seeds the shared vendor profile) for a vendor id the Merqo hub is one-click-activating on qkit.
- `vendor-status/` - `GET` endpoint returning one vendor's activation state and effective tier by email.

## Connectivity

`event-pass-usage`, `metrics`, `vendor-activity` and `vendor-status` import the `bearerOk(request)` guard from `@/lib/merqo/auth`: it reads `process.env.MERQO_METRICS_SECRET`, requires an `Authorization: Bearer <secret>` header, and compares it with `node:crypto`'s `timingSafeEqual` (length-gated first). `vendor-provision` and `entitlement` use `provisionBearerOk(request)` against `MERQO_PROVISION_SECRET`, because both are write capabilities. The email-keyed routes (`entitlement`, `vendor-activity`, `vendor-status`) resolve an email to a vendor id via `listAllAuthUsers(supabase, logPrefix)` plus `findAuthUserByEmail(users, email)`. All routes use `createServiceClient()` (service-role, bypasses RLS) since this is server-to-server. Tier is always derived from the `vendor_entitlements` cache through `resolveEntitlement` (`@/lib/plan`). Where the Merqo contract still has the old two-value plan (`vendor-activity`'s `plan`: `free | pro`, `metrics`'s `pro_vendors`), any paid tier reports as `pro`.

## Parent

[api](../README.md)
