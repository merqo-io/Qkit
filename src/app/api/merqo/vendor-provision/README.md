# vendor-provision

## Purpose

Push-provisioning endpoint: Merqo hub calls this to create a free-tier `vendors` row for a vendor who hasn't signed up on qkit directly yet, keyed on their existing (shared) `auth.users.id`. Companion to `vendor-status` (read) — this is the write direction.

## Contents

- `route.ts`: `POST(request)`. Guarded by `provisionBearerOk()` (`MERQO_PROVISION_SECRET`, a different secret from the metrics routes because this is a write capability) and rate limited. Body validated as `{ user_id: string (uuid) }`. Inserts into `vendors` (id only); a `23505` (already exists) is treated as success. On first creation it also seeds the shared `merqo.vendor_profile` via `getOrCreateVendorProfile(supabase, user_id, null)`. A `23503` (no matching `auth.users` row) returns `400`. Responds `{ ok: true, already_existed }`; it returns no plan, because tiers arrive separately through `POST /api/merqo/entitlement`. Before responding, best-effort logs a `qkit.admin_audit` row via `recordAudit()` (`action: "merqo_vendor_provision"`, `detail.actor: "merqo_system"`), never blocking the response on failure.

## Connectivity

Calls `createServiceClient()`, `provisionBearerOk()` (`@/lib/merqo/auth`), `getOrCreateVendorProfile()` (`@/lib/merqo/vendor-profile`, also used by `onboarding/actions.ts`), and `recordAudit()` (`@/lib/audit`).

## Parent

[merqo](../README.md)
