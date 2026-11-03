# metrics

## Purpose

Endpoint reporting aggregate qkit usage and revenue metrics to the Merqo product, for a cross-product dashboard/report.

## Contents

- `route.ts` — `GET(request)`. Guarded by `bearerOk()` (shared-secret `Authorization: Bearer` check against `MERQO_METRICS_SECRET`, constant-time compare via `timingSafeEqual`, imported from `@/lib/merqo/auth`). Fetches `vendors` (id/created_at), `booths` (id/vendor_id), `orders` (booth_id/status/total_cents/created_at), `payments` (amount_cents/created_at), and `vendor_entitlements` (the cached tier, which decides paid vendors; `pending_upgrade_requests` is always 0 now), in parallel, paging each fleet query in stable ID order. Invalid bearer and rate-limit denials return before constructing the metrics service client. Passes the results to `computeMerqoMetrics()` (`@/lib/merqo/metrics`) and returns `{ product: "qkit", generated_at, ...metrics }` as JSON. Any read failure short-circuits to a 503.

## Connectivity

Calls `createServiceClient()` (`@/lib/supabase/server`, bypasses RLS — appropriate here since this is a server-to-server report, not vendor-scoped) and delegates all metric computation to the pure function `computeMerqoMetrics()` in `@/lib/merqo/metrics`. Its `bearerOk()` guard is the same shared `@/lib/merqo/auth` helper the other three `MERQO_METRICS_SECRET`-gated `merqo/` routes import, not a per-route copy.

## Parent

[merqo](../README.md)
