# merqo

## Purpose

qkit's dealings with merqo, the hub: bearer auth for the merqo-to-kit routes,
fleet metrics, plan requests, vendor status, activity and profile, support
messages, and the kit-to-merqo notify calls.

## Contents

- `auth.ts` — `bearerOk`/`provisionBearerOk`: constant-time bearer-token
  checks against `MERQO_METRICS_SECRET`/`MERQO_PROVISION_SECRET` respectively
  — deliberately separate secrets, since leaking the routine metrics-polling
  one must not also grant the tenant-provisioning write. `listAllAuthUsers`
  reads every auth page and fails the lookup on any page error;
  `findAuthUserByEmail` resolves shared-auth accounts for cross-kit admin flows.
- `customer-notify.test.ts` — tests the request body/header shape for
  all three calls and the fail-closed/never-throw behavior on non-2xx,
  timeout, and network-error cases.
- `customer-notify.ts` — `mintCustomerConnectToken(vendorId, kitSlug,
notifyRef)`/`notifyCustomer(vendorId, notifyRef, message)`/
  `notifyVendor(vendorId, message)`: server-only HTTP client for merqo's
  `POST /api/merqo/customer-connect-token`/`POST /api/merqo/notify-customer`/
  `POST /api/merqo/notify-vendor` endpoints (bearer `MERQO_CUSTOMER_SECRET`,
  `AbortSignal.timeout(3000)`) — the first **kit → merqo** HTTP direction in
  this codebase (every other cross-kit call flows merqo → kit).
  `notifyVendor` is the Phase A2 replacement for qkit's own now-retired
  Telegram bot (`placeOrder`'s vendor order-alert call — see
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`).
  All three fail closed: `mintCustomerConnectToken` Zod-validates the response
  and returns `null` on any non-2xx/timeout/network error or unexpected body,
  `notifyCustomer`/`notifyVendor` catch + log and never throw, same
  fail-closed philosophy as `fetchEarnConfig` in `earn-link.tsx`. All three
  share one `merqoFetch` helper for the bearer-auth/timeout mechanics.
- `downgrade-request.test.ts` — tests the three outcome branches.
- `downgrade-request.ts` — `resolveDowngradeOutcome(hasVendorRow,
currentPlan)`: pure decision (`not_found`/`already_free`/`downgrade`) for the
  admin downgrade-vendor action.
- `metrics.test.ts` — tests the metrics aggregation against synthetic
  vendor/booth/order/payment fixtures.
- `metrics.ts` — `computeMerqoMetrics`: qkit's own business metrics
  (revenue/GMV, active vendors, weekly order deltas, signups, plan mix,
  pending upgrade requests, activation funnel) built on top of
  `admin-stats.ts`'s `summarizeVendors`/`activationFunnel`.
- `support.ts` — `submitSupportMessage`: cross-schema RPC wrapper
  calling merqo's `submit_support_message` (`supabase.schema("merqo").rpc(...)`)
  so a vendor's Get-help message lands in the shared cross-kit
  `merqo.support_messages` inbox — qkit's own local `support_messages`
  table was dropped (migration `0073`) once every reader/writer converged.
  Also exports `MerqoSupportMessagesSchema`, the hand-written mirror of that
  table's row shape shared by every admin page/route that reads it (each
  narrows via its own `.select(...)` string rather than redeclaring the type).
- `upgrade-request.test.ts` — tests the three outcome branches.
- `upgrade-request.ts` — `resolveUpgradeOutcome(hasVendorRow,
hasPendingRequest)`: pure decision (`not_found`/`already_pending`/`create`)
  for the admin/vendor upgrade-to-Pro request flow.
- `vendor-activity.test.ts` — tests the 30d order/revenue rollup, the
  zeroed-fresh-vendor case, and that an open message/expiring pass surface
  the same `attention`/`expiring` statuses the admin console shows.
- `vendor-activity.ts` — `computeVendorActivity(vendor, { booths, orders,
passExpiresAt, hasOpenMessage }, nowMs)`: pure aggregation behind `GET
/api/merqo/vendor-activity` — orders/revenue (30d) and booth counts, plus a
  `status` delegated to `admin-vendor-health.ts`'s `buildVendorHealth` so it
  matches the admin console's own triage rather than re-deriving it.
- `vendor-profile.test.ts` — tests the RPC call shape (schema/function
  name, args) and that a Postgres error surfaces as a thrown `Error` with the
  underlying message.
- `vendor-profile.ts` — `getOrCreateVendorProfile`/`patchVendorProfile`:
  cross-schema helper calling merqo's `get_or_create_vendor_profile`/
  `patch_vendor_profile` RPCs (`supabase.schema("merqo").rpc(...)`) so
  stall name + social links read/write against the shared
  `merqo.vendor_profile` table instead of the stale `qkit.vendors` columns.
- `vendor-status.test.ts` — tests the email-to-vendor resolution,
  including no-match cases.
- `vendor-status.ts` — `resolveVendorStatus(email, authUsers, vendors)`:
  two-step email → auth user → vendor plan lookup (vendors has no email
  column) for admin vendor search.

## Parent

[lib](../README.md)

- `vendor-lookup.ts` — `findVendorByEmail(supabase, tag, email)`: the vendor row for an auth email, `vendor: null` when none, `ok: false` when an upstream read failed. Shared by the upgrade and downgrade request routes.
