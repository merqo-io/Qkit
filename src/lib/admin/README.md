# admin

## Purpose

Admin-only logic: the access gate, fleet stats, vendor health and vendor
names.

## Contents

- `access.test.ts` — tests the admin gate's 404-on-unauthorized behavior.
- `access.ts` — `isAdmin(userId)` (row-presence check against the `admins`
  table) and `requireAdmin()`, the `/admin` route/action gate that 404s (not
  403s, to avoid revealing the route) signed-out or non-admin users.
- `stats.test.ts` — unit tests for the above four aggregation functions.
- `stats.ts` — `activationFunnel` (signed-up → booth → order → Pro,
  distinct-vendor counts), `latestActivePassByVendor` (per-vendor live-license
  expiry map), `summarizeVendors`/`summarizeEvents` (plan/signup and event-type
  rollups) for the `/admin` overview.
- `vendor-health.test.ts` — tests status classification rules and the
  health-map rollup.
- `vendor-health.ts` — `vendorStatus`/`buildVendorHealth({ vendors, booths, orders, openMessageVendorIds }, nowMs)`: classifies each
  vendor into a banded `VendorStatus` (`attention`/`expiring`/`stuck`/`quiet`/
  `new`/`healthy`, first-match-wins) plus `statusRank` (triage sort key) and
  `passHoursLeft`; deliberately not a synthetic numeric score.
- `vendor-names.test.ts` — tests parallel resolution, dedup of repeated
  ids into a single call each, and the empty-list no-op.
- `vendor-names.ts` — `vendorStallNames(supabase, vendorIds)`: resolves
  each vendor id's stall name from `merqo.vendor_profile` (via
  `getOrCreateVendorProfile`), one RPC per unique id run in parallel —
  admin-only, low-traffic call sites, no batch-read RPC exists on the merqo
  side.

## Parent

[lib](../README.md)
