# verify

## Purpose

Verifies an emailed auth link on this app's origin and starts the session.

## Contents

- `route.ts` - `POST(request)` delegating to `handleAuthConfirm` from `@merqo/ui/auth` with `createServerClient`. Lands on `/dashboard` by default (or the safe `next`), sends a `recovery` link to `/reset-password`, and sends every failure, including a cross-origin POST, to `/login?error=link`. No GET handler.
- `route.test.ts` - wiring tests: success, recovery, failure and cross-origin rejection.

## Connectivity

Target of the form rendered by `../page.tsx`. Depends on `@/lib/supabase/server` and `@merqo/ui/auth`.

## Parent

[confirm](../README.md)
