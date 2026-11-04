# merqo

## Purpose

Tests for the `src/app/api/merqo/` route handlers, the bearer-token-gated surface Merqo calls.

## Contents

- `entitlement.test.ts` - tests `POST /api/merqo/entitlement`: 401 without the provision bearer, 429 when rate limited, 400 for malformed JSON, contract violations (missing field, bad timestamp, unknown tier, `paid` for qkit) and a payload for another kit, 404 `unknown_vendor`, 503 on a failed directory lookup, 200 `{ ok: true }` after calling `apply_vendor_entitlement` with the mapped arguments, 200 when the SQL function reports a stale push, and 500 when the write fails.
- `event-pass-usage.test.ts` - tests `GET /api/merqo/event-pass-usage`: 401 without the bearer, 429 when rate limited, 400 for a bad UUID, non-ISO or offset-less timestamps, an inverted window and missing params, 200 with the `vendor_cups_between` arguments and body, and a generic 500 when the RPC fails. The RPC is never called on a rejected request.
- `metrics.test.ts` - tests `GET /api/merqo/metrics`. Mocks `createServiceClient` with a thenable query-builder stub. Asserts 401 for a missing, wrong or unconfigured bearer, the full contract shape on success (paid vendors come from the `vendor_entitlements` cache; `pending_upgrade_requests` is a constant 0) and 503 when a read errors.
- `vendor-provision.test.ts` - tests `POST /api/merqo/vendor-provision`: 401 without the bearer, 400 for a non-UUID or unknown user, 200 `{ ok, already_existed }` for first and repeat provisioning (the profile is only seeded the first time) and 500 when the insert or profile seed fails.
- `vendor-status.test.ts` - tests `GET /api/merqo/vendor-status`: auth, validation and rate limiting, the matched-vendor-only lookup, the effective tier from the entitlement cache, and fail-closed 503s.

## Connectivity

Tests the route handlers in `src/app/api/merqo/`, which build on `@/lib/merqo/*` and `@/lib/plan`. The mocked `createServiceClient` stands in for the real RLS-bypassing service-role client.

## Parent

[api](../README.md)
