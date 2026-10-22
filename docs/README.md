# docs

## Purpose

Project documentation: deployment notes, the engineering constitution, business/GTM docs, and dated design history.

## Contents

- `DEPLOY.md` — deploy notes: qkit runs on the shared Merqo Supabase project (same as loopkit/merqo) in its own `qkit` schema; documents the qkit-loopkit auto-award integration order (apply merqo's `0008_kit_events.sql` before this repo's `0051_emit_order_completed.sql`) and the `NEXT_PUBLIC_LOOPKIT_URL` env var that must be set in Vercel before deploying the order-status page change (fails closed — the earn link silently doesn't show without it).
- `DEPLOY.md` also covers staging: Preview runs against a separate staging Supabase project, the `staging` branch is served at `qkit-staging.merqo.io`, and it lists qkit's `Preview` env var overrides (full setup in merqo's `docs/STAGING.md`).
- `ROLLBACK.md` — rollback runbook (2026-07-18): app-code rollback is instant via Vercel's built-in rollback (dashboard or `vercel rollback`), now with clean tag references from the auto-tagging workflow. DB rollback does **not** work the same way — migrations are forward-only by convention, a bad one gets fixed by a new corrective migration, never reverted; PITR restore is a last resort for catastrophic loss, not a normal rollback path.
- `OPS-RUNBOOK.md` — operational triage runbook (2026-09-01): symptom → fix table for live-event issues, split into what's self-serve with no dev needed (vendor's own board fixes a stuck order, Vercel's Promote-to-Production for a bad deploy, existing `/admin` controls) versus the fail-closed integrations (paykit/printkit/Telegram/loopkit) whose missing env var looks identical to a bug, versus what genuinely needs a dev, plus the staging-first gate for PRs that add a migration.
- `business/` — go-to-market and business-strategy documentation (own README).
- `CONSTITUTION.md` — the "inviolable principles" doc (the _why-never-change_, complementing `AGENTS.md`'s _how-to-route_): RLS-only authorization, service-role-server-only, Zod-at-every-boundary + strict TypeScript, no secrets in `NEXT_PUBLIC_*`, `@supabase/ssr`/`supabase-js` version compatibility, dual-written schema changes (migrations + `types.ts`), and permission deny-rules as a guardrail not a sandbox. Also documents the test matrix (unit/component/e2e/RLS/mutation/type-lint-fmt, each with its CI scope).
- `meta/` — roadmap, audit-findings, and task-registry docs tracking work across the project (own README).
- `superpowers/` — dated design specs and implementation plans produced by the brainstorm-then-plan workflow used to build features in this repo (own README).

## Connectivity

`CONSTITUTION.md` is the authority `AGENTS.md` defers to for anything touching auth, schema, or the harness ("read it before changing auth, schema, or the harness"). `business/` holds go-to-market documentation; `meta/` holds the roadmap and audit-findings docs tracking work across the project; `superpowers/` holds the dated design specs and implementation plans produced by the brainstorm-then-plan workflow used to build features in this repo. `DEPLOY.md` is referenced when actually shipping a change to the shared Merqo Supabase project.

## Parent

[qkit](../README.md)
