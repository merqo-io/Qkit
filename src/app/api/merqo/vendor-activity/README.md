# vendor-activity

## Purpose

Endpoint reporting one vendor's richer cross-kit activity snapshot to
merqo's admin `/admin/vendors/[email]` detail page — plan, health triage
status, a few labeled metrics, and last-activity timestamp — looked up by
email. Generalizes `../vendor-status`'s `{active, plan}` shape into the
shared `{active, plan, status, metrics, lastActivityAt}` contract every
kit implements; see
`docs/business/2026-08-26-cross-kit-vendor-activity-design.md` (outside
this repo) for the cross-kit design.

## Contents

- `route.ts` — `GET(request)`. Guarded by `bearerOk()` (shared-secret
  `Authorization: Bearer` check against `MERQO_METRICS_SECRET`, imported
  from `@/lib/merqo/auth`). Reads `email` off the query string, validated
  with `z.object({ email: z.email() })`. Resolves the email to an
  auth user via `listAllAuthUsers()`/`findAuthUserByEmail()`
  (`@/lib/merqo/auth`) — 404 if no auth user matches. Reads the matching
  `vendors` row — 404 if none exists (a vendor who has never touched qkit
  at all). For a vendor that does exist, reads that vendor's `booths`,
  `licenses`, and open `merqo.support_messages` (service-client cast to the
  `merqo` schema, same pattern as `admin/page.tsx`/`admin/vendors/[id]/
page.tsx` — merqo's own RLS on that table gates on `merqo_team` membership,
  not qkit admin membership; the authenticated machine endpoint uses its service role to bypass that RLS), then that vendor's `orders` (scoped to
  those booth ids), and delegates the actual aggregation to
  `computeVendorActivity` (`@/lib/merqo/vendor-activity`).
- `route.test.ts` — tests the 401/400/404/200/503 status branches against a
  mocked Supabase client, and that an open support message surfaces as
  `status: "attention"`.

## Connectivity

Shares `bearerOk()`/`listAllAuthUsers()`/`findAuthUserByEmail()`
(`@/lib/merqo/auth`) with the other four routes in `../`. Delegates status
classification to `@/lib/admin/vendor-health`'s `buildVendorHealth` (via
`computeVendorActivity`) — the same triage the `/admin` vendor console
renders, so this endpoint's `status` never drifts from what a qkit admin
sees locally. `computeVendorActivity` also reuses `@/lib/admin/stats`'s
`latestActivePassByVendor` for pass-expiry input to that same triage.

## Parent

[merqo](../README.md)

The route reads vendor data through `readActivityData`.
