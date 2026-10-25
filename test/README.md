# test

## Purpose

Vitest tests that aren't colocated with their source: API route-handler tests
(mirroring `src/app/api/`'s folder structure, `api/`), migration-content
assertion tests (`db/`), one `src/lib/` unit test that isn't colocated
(`lib/`), and two real-database integration tests that can't run as fast
colocated unit tests.

Real-database tests run only with `RUN_DB_TESTS=1`. Supply
`QKIT_TEST_SUPABASE_URL` and `QKIT_TEST_SUPABASE_SECRET_KEY` for an isolated
database. Neither suite reads application environment files during collection.

## Contents

- `db-env.ts` — validates explicit integration-test configuration when a test runs.
- `demo-base-url.test.ts` — allows loopback demo origins and rejects remote,
  credentialed or path-bearing targets before synthetic browser writes.

- `api/` — route-handler tests, one file per route, mirroring
  `src/app/api/`'s structure one-for-one; see its own README.
- `db/` — one test per `supabase/migrations/*.sql` file, asserting on the
  migration's SQL text (no live DB required); see its own README.
- `lib/` — a `src/lib/` unit test that isn't colocated with its source; see
  its own README.
- `next-config-headers.test.ts` — asserts `next.config.ts`'s `headers()`
  omits `X-Frame-Options`/CSP `frame-ancestors` in development and sends
  both in production (regression test for the IDE-preview-pane dev bug).
- `order-numbering.integration.test.ts` — integration test for migration
  `0008` (atomic per-booth order numbering). Hits a REAL Supabase instance,
  so it's opt-in (`describe.skipIf(!RUN_DB_TESTS)`, gated behind the
  `RUN_DB_TESTS` env var so the default `pnpm test` run doesn't fail when no
  local DB is up). Seeds a throwaway auth user → vendor → booth via the
  service-role client, fires 25 concurrent `next_order_number` RPC calls +
  service-role order inserts, and asserts
  all 25 order numbers are distinct, sequential (`0001`..`0025`, no gaps),
  and that exactly 25 rows landed — proving the row-locked counter doesn't
  collide the way the pre-migration `COUNT(*)`-based numbering did. Uses explicitly supplied isolated-test credentials and tears down its
  seeded data in `afterAll`.
- `vendor-profile-cross-schema.integration.test.ts` — de-risking spike
  integration test (same explicit opt-in and test credentials as the numbering suite) proving that a Supabase
  client configured with `db.schema: "qkit"` (mirroring every real qkit
  server client) can still call `get_or_create_vendor_profile` via
  `.schema("merqo").rpc(...)` — i.e. the cross-schema RPC pattern
  `merqo-vendor-profile.ts` relies on actually works against the live
  shared Supabase project. It removes only its randomly identified fixture in
  `finally`, including assertion failures.
- `setup.ts` — the global Vitest setup file: imports
  `@testing-library/jest-dom/vitest` matchers, polyfills
  `Element.prototype.hasPointerCapture`/`setPointerCapture`/
  `releasePointerCapture`/`scrollIntoView` as no-ops (jsdom doesn't
  implement the Pointer Events capture API — Radix popover-based
  primitives like `Select` call these on open/close/keyboard-nav and throw
  without a stand-in), stubs a no-op `ResizeObserver` (jsdom doesn't
  implement it at all; Radix's Tooltip/Select/Popover primitives use it via
  `@radix-ui/react-use-size` to measure an anchor, throwing once more than
  one is mounted at the same time — e.g. several booth-toggle tooltips
  inside an open dialog), and runs `cleanup()` from `@testing-library/react`
  after every test, but only when a DOM exists (component tests opt into
  `jsdom` via a `// @vitest-environment jsdom` docblock; plain
  node-environment `lib` tests would throw if this touched `document`
  unconditionally).
- `service-worker.test.ts` — imports the repository worker with isolated global fixtures
  with mocked clients to verify exact notification targets, unrelated tabs,
  missing window APIs and rejection of unsafe navigation URLs.

## Connectivity

`api/` mirrors `src/app/api/`'s structure one-for-one so each route handler
has a corresponding test file here rather than living next to the route
(keeping `src/app/api/` free of test files). `db/` and the two
`*.integration.test.ts` files both guard the `merqo`/`qkit` cross-schema
split introduced by the shared-vendor-profile migrations, from two angles:
`db/` checks the migration SQL statically, the integration tests check the
runtime RPC behavior against a live DB. `setup.ts` is wired in as
Vitest's global setup (see the Vitest config) and runs before/after every
test file in the project, including tests colocated elsewhere (e.g.
`src/lib/*.test.ts`, `src/hooks/*.test.tsx`).

## Parent

[qkit](../README.md)

`next-config-headers.test.ts` now covers only `X-Frame-Options`; the CSP and its dev `frame-ancestors` rule are tested in `src/proxy.test.ts`.
