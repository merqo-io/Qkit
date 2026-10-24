# supabase

## Purpose

The Supabase client factories (browser, server, and service-role) and the
per-request auth/vendor/entitlement resolution helpers that every dashboard
page, layout, and Server Action builds on. This is the one place that knows
how to construct a client for each execution context (client component vs.
Server Component/Action vs. RLS-bypassing admin work) and the one place the
"is this user a signed-in, onboarded vendor with what entitlement" question is
answered.

## Contents

- `client.ts` — `createClient()`: browser Supabase client
  (`createBrowserClient` from `@supabase/ssr`), scoped to the `qkit` schema,
  built from `publicEnv` (client-safe). Used by client components (e.g.
  `useRealtimeOrders`).
- `get-entitlement.ts` — `loadEntitlement()` (React `cache`-memoized):
  resolves the current user's vendor row and effective `Entitlement` in one
  request, fetching the vendor row and the latest currently-active license in
  parallel (both key on `user.id`); degrades to a plan-only entitlement if the
  `licenses` table/query errors, but rethrows on a vendor-read error (to avoid
  misrouting an onboarded vendor to `/onboarding` on a transient DB hiccup);
  backfills `board_settings` with `DEFAULT_BOARD_SETTINGS` if migration 0050
  hasn't reached the DB yet. After the vendor/license read, overwrites
  `vendor.name`/`vendor.social_links` with the values from the shared
  `merqo.vendor_profile` table (via `@/lib/merqo/vendor-profile`'s
  `getOrCreateVendorProfile`, `supabase.schema("merqo").rpc(...)`) — those
  two fields don't exist on `qkit.vendors` at all as of migration 0069 —
  `merqo.vendor_profile` is the only source. `requireEntitledVendor()` is the
  redirect-on-failure page-guard wrapper (`/login`, then `/onboarding`, then
  `/legal/accept` via `requireCurrentLegalAcceptance` from `@/lib/legal-gate`
  when the vendor's accepted terms/privacy versions are stale).
- `get-user.ts` — `getUser()`: the current auth user via
  `supabase.auth.getUser()`, memoized per request with React `cache` so a
  layout and its page don't each pay their own round-trip.
- `get-vendor.ts` — `getVendor()` (React `cache`-memoized): the auth/onboarding
  gate — resolves `{ user, vendor }`, treating a `maybeSingle()` read error as
  a thrown failure (not "not onboarded", which would misroute on a transient
  error) and backfilling `board_settings` the same way as
  `get-entitlement.ts`. `requireVendor()` is the redirect-on-failure guard
  (`/login`, `/onboarding`, then `/legal/accept` via the same
  `requireCurrentLegalAcceptance` gate as `requireEntitledVendor`).
- `get-vendor.test.ts` — tests that `requireVendor` routes the signed-in
  vendor's email through the legal gate, propagates its `/legal/accept`
  redirect, and never consults the gate before the `/onboarding` redirect.
- `middleware.ts` — `updateSession(request)`, called from `src/proxy.ts`:
  refreshes the Supabase session cookie via `createServerClient` from
  `@supabase/ssr`, but only resolves `auth.getUser()` (and redirects
  unauthenticated requests to `/login`) for `isProtectedPath` routes
  (`/dashboard`, `/onboarding`, `/admin`) — the anonymous, hot customer-
  ordering funnel (`/o`, `/order`) skips the auth round-trip entirely.
- `server.ts` — `createServerClient()`: cookie-backed server Supabase client
  (Server Components/Actions) built from `publicEnv`, with a `setAll` that
  swallows the read-only-cookie-store error in Server Component contexts (the
  middleware owns session refresh instead). `createServiceClient()`: the
  secret-key, RLS-bypassing client — deliberately given an EMPTY cookie
  adapter (attaching request cookies would silently re-authenticate every
  query as the calling user instead of service-role) and validates
  `SUPABASE_SECRET_KEY` inline rather than in `@/lib/env` so the secret never
  enters a browser-reachable module.

## Connectivity

`client.ts` is imported by client components, notably
`src/hooks/use-realtime-orders.ts`. `server.ts`'s `createServerClient` is the
base every other file in this folder builds on (`get-user.ts` →
`get-vendor.ts`/`get-entitlement.ts`); `createServiceClient` is used directly
by Server Actions/Route Handlers that must bypass RLS (e.g. admin operations,
the customer status page's service-role read). `middleware.ts`'s
`updateSession` is called from `src/proxy.ts` on every request. `get-vendor.ts`
and `get-entitlement.ts` both consume `get-user.ts`'s `getUser` and are in turn
consumed by the dashboard layout/pages (`requireVendor`/`requireEntitledVendor`)
to gate access and resolve plan/pass entitlement (`@/lib/plan`'s
`getEntitlement`).

## Parent

[lib](../README.md)

read-all.ts provides readAllRows for ordered queries that must return complete
results across the PostgREST row cap. It fails on incomplete/error responses.

`read-keyset.ts` provides `readKeysetRows` for mutable queues. Callers select an
ID, order ascending by ID and fetch after the previous page's last ID. This
keeps a completing/removing earlier order from shifting an offset and hiding
the next order. Failed reads and nonadvancing cursors reject the whole result.

`middleware.ts` clears the host-only copy of any auth cookie the browser sends twice (host-only plus `.merqo.io`) on every request, with no one-time marker, so a re-created duplicate cannot send the vendor back to /login.
