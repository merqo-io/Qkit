# entitlement

## Purpose

Receiver for Merqo's subscription push. Merqo owns subscriptions and pushes each vendor's entitlement to every kit; qkit caches it in `qkit.vendor_entitlements` and derives every plan gate from that cache.

## Contents

- `route.ts` - `POST(request)`. Guarded by `provisionBearerOk()` (`MERQO_PROVISION_SECRET`), rate limited (120 per minute per IP), and validated with `entitlementPayloadSchema` (`@/lib/merqo/entitlement-contract`, the verbatim wire contract). Answers 400 for a malformed body or a payload for another kit, 404 `{ ok: false, error: "unknown_vendor" }` when no auth account matches the email, 503 when the directory lookup fails, 500 when the write fails, and 200 `{ ok: true }` otherwise. The write is the `qkit.apply_vendor_entitlement` SQL function, which enforces `issued_at` ordering atomically, so a stale or replayed push changes nothing and still answers 200.

## Connectivity

Uses `createServiceClient()`, `listAllAuthUsers`/`findAuthUserByEmail` (`@/lib/merqo/auth`) and `rateLimit` (`@/lib/rate-limit`). The cache it writes is read by `@/lib/supabase/get-entitlement` (vendor session) and `@/lib/counter-ops` (customer-facing paths). Tests: `test/api/merqo/entitlement.test.ts`.

## Parent

[merqo](../README.md)
