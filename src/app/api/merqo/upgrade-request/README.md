# upgrade-request

## Purpose

Endpoint the Merqo product calls to file a monthly-Pro upgrade request on a vendor's behalf, keyed by email rather than a qkit session.

## Contents

- `route.ts` — `POST(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check, constant-time compare, imported from `@/lib/merqo/auth`, same helper `../metrics/route.ts` uses). Body validated with `z.object({ email: z.email() })`. Looks up the auth user by email via `@/lib/merqo/auth`'s `listAllAuthUsers()` + `findAuthUserByEmail()` (case-insensitive, across all auth pages), checks for an existing pending `purchase_requests` row of kind `monthly`, and feeds `(vendorFound, alreadyPending)` to `resolveUpgradeOutcome()` (`@/lib/merqo/upgrade-request`): `not_found` → 404, `already_pending` → 200 no-op, otherwise inserts a new `purchase_requests` row (`kind: "monthly"`). Returns `{ success, error? }` JSON with 401/400/404/503/200 status codes.

## Connectivity

Calls `createServiceClient()` and `resolveUpgradeOutcome()` (`@/lib/merqo/upgrade-request`) for the pure decision logic. The resulting `purchase_requests` row surfaces in `admin/page.tsx`'s "Upgrade requests" inbox, the same table `app/actions/purchase.ts`'s `requestUpgrade()` writes to from inside the app — this endpoint is the Merqo-initiated equivalent of that in-product action. Shares its `bearerOk()`/`listAllAuthUsers()`/`findAuthUserByEmail()` helpers (`@/lib/merqo/auth`) with `../downgrade-request/route.ts` and `../vendor-status/route.ts`.

## Parent

[merqo](../README.md)
