# summary

## Purpose

Read-only sales summary export, v1 of the external contract described in `lib/sales-summary`. The response shape is frozen now so a future consumer (a sibling "-kit" product) can integrate without a rewrite, even though machine auth (per-vendor API keys) for that cross-product access is a deliberate not-yet-built step.

## Contents

- `route.ts` — `GET(request)` handler. Auth today is the vendor's own Supabase session cookie (`loadEntitlement()` resolves `user`/`vendor`/`entitlement`; 401 if either is missing) — so it currently serves the vendor's own browser/same-origin calls, RLS-scoped per row, not a machine/API-key caller. Rate-limited per vendor (`sales-summary:<vendorId>`, 30/60s, `429` past that) — RLS already scopes every row to the caller's own booths, so this only caps self-inflicted DB load, not a cross-tenant concern. Reads `range` (`24h`/`7d`/`30d`/`90d`, clamped to what the vendor's plan entitlement allows via `entitlement.statsRanges`) and `booth` (validated against the vendor's own booth ids) query params. Queries the vendor's `booths`, then `orders` (`status, total_cents, items, created_at, payment_status`) within the computed time cutoff, parses `items` with `parseOrderItems`, and reduces them with `computeStats` from `@/lib/stats`. Any Supabase read error returns `503 Upstream unavailable` rather than a fake zeroed summary — this is a revenue contract, so failing loud beats a silent under-report. Shapes the final payload with `toSalesSummaryV1(summary, { range, boothId, generatedAt })` from `@/lib/sales-summary`.

## Connectivity

Called by whatever holds the vendor's session cookie (currently same-origin dashboard/browser callers only — no external API-key path exists yet). Depends on `@/lib/supabase/server` (`createServerClient`), `@/lib/supabase/get-entitlement` (`loadEntitlement`), `@/lib/schemas` (`parseOrderItems`), `@/lib/stats` (`computeStats`, `StatsOrder`), `@/lib/sales-summary` (`toSalesSummaryV1`), and `@/lib/utils` (`MS_PER_DAY`).

The `range` query is validated with `isStatsRange`; a vendor whose only upgrade is a running Event Pass cannot see history from before the pass started (`entitlement.statsSince` floors the window).

## Parent

[sales](../README.md)
