# skills

## Purpose

Project-specific slash-command skills available to Claude Code in this repo.

## Contents

- `changelog/` — the `/changelog` skill: appends a Keep-a-Changelog bullet to the repo-root `CHANGELOG.md`, under `## [Unreleased]` or the heading of the version this branch bumps.
- `next-verify/` — the `/next-verify` skill: runs `pnpm check && pnpm test && pnpm build` (prettier + eslint + tsc, then vitest, then the production build) and reports the results.
- `security-scan/` — the `/security-scan` skill: runs `gitleaks git --redact`/`gitleaks protect --staged --redact`, `pnpm audit --prod --audit-level=high` (gate), and a full `pnpm audit` (informational) before a push.
- `supabase-migrate/` — the `/supabase-migrate` skill (model-invocation disabled, must be called explicitly): applies `supabase/migrations/` via the Supabase CLI (local or linked) and regenerates `src/lib/types.ts`, with an RLS/realtime safety checklist.

## Connectivity

Each subfolder is one skill (a `SKILL.md` with YAML frontmatter — `name`, `description`, `allowed-tools`, and for `supabase-migrate` also `disable-model-invocation: true` so it only runs on explicit `/supabase-migrate` invocation, never auto-triggered). `next-verify` and `supabase-migrate` wrap this project's own verify/migration workflows (typecheck+lint+test+build; applying `supabase/migrations`); `changelog` and `security-scan` are narrower single-purpose utilities (Keep-a-Changelog entries; local secret scan + dependency audit). All four are listed in `AGENTS.md`'s "Skills" table as the first place to check before falling back to templateCentral's stack-agnostic skills.

## Parent

[.claude](../README.md)
