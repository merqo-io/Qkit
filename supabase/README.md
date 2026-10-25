# supabase

## Purpose

Everything that defines and exercises the `qkit` Postgres schema: the ordered
migration history (tables, RLS policies, SECURITY DEFINER RPCs, the realtime
publication), local-dev configuration for the Supabase CLI, demo/CI seed data,
and the pgTAP test suite that guards RLS isolation. This is the authorization
layer for the whole app — qkit enforces access control in Postgres (RLS +
explicit Data-API grants), not in application code.

## Contents

- `config.toml` — Supabase CLI local-dev config: exposes only the `qkit` +
  `graphql_public` schemas to the Data API (`api.schemas`), pins
  `auto_expose_new_tables = false` (Data-API grants are made explicit in
  migration `0041_data_api_grants.sql` instead, so the exposed surface doesn't
  depend on CLI-version auto-grant behavior), Postgres major version 17, and
  the standard local ports/services (API 54321, DB 54322, Studio 54323,
  Inbucket 54324, seed file `./seed.sql` — though this project's real seeding
  is the manually-run scripts in `seed/`, not `db reset`'s auto-seed path).
- `migrations/` — the ordered SQL schema history;
  see its own README for the full theme breakdown.
- `seed/` — demo and CI seed data (sample booths/menus, a CI auth bootstrap);
  see its own README.
- `snippets/` — Supabase Studio's saved-query folder; currently empty.
- `tests/` — pgTAP authorization, settings, ordering and concurrency regressions, run via
  `supabase test db`; see its own README.

## Connectivity

`migrations/` is applied in order via the Supabase CLI (`supabase db push`/
`db reset`, or the project's `/supabase-migrate` skill) to build the live
schema that every Supabase client in `src/lib/supabase/` queries against.
`seed/` scripts are run manually (never via `db reset`'s auto-seed) against a
local or hosted Supabase instance to populate demo/e2e data — `e2e/*.spec.ts`
and `pnpm test:e2e` depend on `coffee-cart.sql` having been applied. `tests/`
is run standalone (`supabase test db`) against a freshly-migrated database and
is independent of the Next.js app; it's the authoritative check that
`migrations/`'s RLS policies actually hold cross-vendor isolation, and is
referenced directly from `AGENTS.md`'s "RLS isolation" note.

## Parent

[qkit](../README.md)

`config.toml` enables TOTP enrol and verify so the e2e admin flow can clear MFA locally.
