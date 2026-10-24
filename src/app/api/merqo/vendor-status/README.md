# vendor-status

## Purpose

Endpoint reporting a single vendor's current plan/status to the Merqo product, looked up by email.

## Contents

- `route.ts` — `GET(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check against `MERQO_METRICS_SECRET`, constant-time compare, imported from `@/lib/merqo/auth`). Reads `email` off the query string, validated with `z.object({ email: z.email() })`. Resolves the email through `listAllAuthUsers()`, then reads only that user's vendor row. `resolveVendorStatus(email, users, vendors)` (`@/lib/merqo/vendor-status`) shapes the response without fetching unrelated vendor rows. `listAllAuthUsers()` reads successive 1000-user pages and fails the lookup on a page error, rather than reporting a later account absent.

## Connectivity

Calls `createServiceClient()` and `resolveVendorStatus()` (`@/lib/merqo/vendor-status`) for the pure matching logic. Shares its `bearerOk()`/`listAllAuthUsers()` helpers (`@/lib/merqo/auth`) with `../downgrade-request/route.ts` and `../upgrade-request/route.ts`.

## Parent

[merqo](../README.md)
