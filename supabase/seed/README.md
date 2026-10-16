# seed

## Purpose

Demo and CI seed data — sample booths/menus for local development, the
demo-video recorder, e2e tests, and CI's auth bootstrap. None of these run
automatically via `supabase db reset`'s seed hook (`config.toml` points at
`./seed.sql`, which doesn't exist here) — every script in this folder is run
manually. The coffee-cart seeds use guarded upserts; two-booth demo seeds refuse
vendors with existing booths and never delete their orders.

## Contents

- `ci-auth-bootstrap.sql` — creates the fixed-UUID `auth.users` row
  (`6df824a1-...`, email `e2e-test@qkit.local`) and its matching
  `qkit.vendors` row that the other local seed scripts assume already
  exists. Needed only in CI, where a fresh `supabase start` database has no
  such user (a local dev DB already has the developer's real "Test" vendor
  from normal sign-up).
- `coffee-cart.sql` — seeds one active booth ("Kopitiam Cart") under the
  existing "Test" vendor with 3 customizable drinks (Kopi/Teh/Milo, each with
  style/temperature/sugar option groups) and a fixed e2e-only `short_code`
  (`e2eKopitiam01`) so `e2e/*.spec.ts` can navigate to `/o/e2eKopitiam01`
  deterministically; also wires a PayNow payment method (UEN) so the payment
  panel and payment-queue e2e specs have a local payment marker. This does not
  configure Paykit's vendor payment record; a working checkout also needs the
  separate local Paykit setup. `print_enabled = true` represents an opted-in
  booth, but payment-required QR orders still start `pending` under `0087`.
  `e2e/customer-order.spec.ts` covers checkout, claim and initial tracking;
  `e2e/vendor-fulfillment.spec.ts` carries the order on through the board
  (start, ready, picked up) as this booth's vendor. Kopi/Teh's milk-style choices
  demonstrate the price/cost-delta and allergen tagging
  features (2026-07-18): "C"/"Normal" are tagged `dairy`, an added "Oat Milk"
  choice carries `price_delta_cents:100`/`cost_delta_cents:40`; Milo is
  tagged `dairy`/`soy` at the item level (no milk-style group to vary it —
  the fixed-ingredient half of the allergen model).
- `e2e-merqo-stub.sql` — local/CI only: the slice of merqo's schema the
  vendor dashboard reads on every render (`merqo.vendor_profile` and
  `merqo.get_or_create_vendor_profile`, copied from merqo migrations 0009 and
  0033). qkit's own migrations never create the `merqo` schema, so without
  this `/dashboard` errors on a local stack. It also adds `merqo` to
  PostgREST's exposed schemas through the in-database `pgrst.db_schemas`
  setting on the `authenticator` role, leaving `config.toml` alone. Idempotent.
  Needed by `e2e/vendor-fulfillment.spec.ts`; never run it against a hosted
  project, where merqo's real migrations own the schema.
- `coffee-cart-prod.sql` — the same Kopitiam Cart booth, parameterized for a
  hosted (production) Supabase project: the operator replaces
  `__VENDOR_ID__` with their own auth-user UID and runs it in the Supabase
  SQL Editor; upserts the vendor row (no-op if already onboarded) then the
  booth. An existing booth with the fixed demo UUID is updated only when it
  already belongs to that vendor; it is never transferred with its orders.
  Choose a different booth UUID to create a second vendor's demo.
- `demo-two-booths.sql` — a richer local demo dataset: upserts the "Test"
  vendor onto the `pro` plan (to lift the 1-booth free cap), then creates
  two active booths only if the vendor has no existing booths. A table lock
  protects the guard and inserts, and a repeat run refuses. The booths are "Kopitiam Cart" (PayNow-enabled, same
  Oat Milk/dairy tagging as `coffee-cart.sql`) and an "Ice Cream Cart"
  (queue-only, no payment method) — for demo-video recording and manual
  multi-booth testing. The Ice Cream Cart's multi-select "Toppings" group
  is a second, independent allergen example — "Peanuts" tagged `nuts`,
  "Wafer" tagged `gluten` — showing the tagging works on `multiple:true`
  groups too. Explicitly never run via `db reset`.
- `demo-two-booths-prod.sql` — the production variant: takes a single
  `__VENDOR_ID__` placeholder (the operator's own account), upgrades that
  account to `pro` and inserts demo booths only if it has no existing booths.
  It refuses before writes otherwise and never deletes orders. Use a dedicated
  empty demo account. It does not modify `auth.users`.

## Connectivity

Run manually against a local (`supabase start`) or hosted Supabase instance,
after `supabase/migrations/` has been applied — e.g.
`docker exec -i supabase_db_qkit psql -U postgres -d postgres < supabase/seed/coffee-cart.sql`.
`ci-auth-bootstrap.sql` runs first in CI (before `coffee-cart.sql`) since the
latter's booth insert has a FK dependency on the vendor it creates. The
`coffee-cart.sql` seed's "Kopitiam Cart" booth and its `e2eKopitiam01` short
code are a hard dependency of `e2e/customer-order.spec.ts`,
`e2e/order-code.spec.ts` and `e2e/vendor-fulfillment.spec.ts`; the last also
needs `e2e-merqo-stub.sql`, which CI applies third (see the root `AGENTS.md`
E2E instructions). The `/seed/*.svg` banner images referenced by
these scripts ship with the app under `public/`, so they resolve without any
upload step, including on a deployed prod site.

## Parent

[supabase](../README.md)
