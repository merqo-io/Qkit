# downgrade-request

## Purpose

Endpoint the Merqo product calls to move a vendor back to the free plan (e.g. when Merqo's own subscription lapses), keyed by email rather than a qkit session.

## Contents

- `route.ts` — `POST(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check, constant-time compare, imported from `@/lib/merqo/auth`). Body validated with `z.object({ email: z.email() })`. Looks up the auth user by email via `@/lib/merqo/auth`'s `listAllAuthUsers()` + `findAuthUserByEmail()` (case-insensitive match across all auth pages), reads the matching `vendors` row's `plan`, and feeds `(vendorFound, currentPlan)` to `resolveDowngradeOutcome()` (`@/lib/merqo/downgrade-request`) to decide one of three outcomes: `not_found` → 404, `already_free` → 200 no-op, or downgrade → `UPDATE vendors SET plan = 'free'` plus a best-effort clear of any pending `monthly` `purchase_requests` row. Returns `{ success, error? }` JSON with 401/400/404/503/200 status codes as appropriate.

## Connectivity

Calls `createServiceClient()` (`@/lib/supabase/server`) and `resolveDowngradeOutcome()` (`@/lib/merqo/downgrade-request`) for the pure decision logic. Shares its `bearerOk()`/`listAllAuthUsers()`/`findAuthUserByEmail()` helpers (all from `@/lib/merqo/auth`) with `../upgrade-request/route.ts` and `../vendor-status/route.ts`. Called by the external Merqo product, not by any code inside this repo.

## Parent

[merqo](../README.md)

The vendor lookup is shared with the upgrade route through `findVendorByEmail` (`@/lib/merqo/vendor-lookup`).
