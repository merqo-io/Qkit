# scripts

## Purpose

Standalone tooling scripts that aren't part of the Next.js app itself — the demo-video generator. (The README-freshness nudge formerly here as `check-readme-freshness.mjs` moved to `.husky/lib/readme-coupling.sh` as part of the lefthook→husky migration.)

## Contents

- `demo/` — the prospect-facing demo-video generator (Playwright recorder + ffmpeg compositor).
- `staging-migrate.sh`: applies `supabase/migrations` to the staging Supabase project with psql, one transaction per file. Run it inside `postgres:17.6-alpine` with the repo mounted at `/repo` (merqo's `docs/STAGING.md`). With no arguments it bootstraps every file and refuses if the `qkit` schema already exists; with file arguments it applies only those, for the staging-first migration gate. `.gitattributes` keeps it on LF line endings so it runs in a Linux container from a Windows checkout.

## Connectivity

`demo/` holds the only script suite in this folder today; see `scripts/demo/README.md`. The README-coupling nudge that used to live here now runs as a husky `pre-commit` command (`.husky/lib/readme-coupling.sh`).

## Parent

[qkit](../README.md)
