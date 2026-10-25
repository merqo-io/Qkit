# callback

## Purpose

The Supabase auth callback route: both OAuth sign-in (e.g. Google) and the password-recovery email link land here to complete the session before being redirected onward.

## Contents

- `route.ts` — `GET(request)`. Reads `code` and an optional `next` query param off the callback URL. Rejects an unsafe `next` (accepts only a same-origin relative path starting with a single `/`, not `//`, to block an open-redirect) and falls back to `/dashboard`. If `code` is missing, redirects to `/login?error=oauth`. Otherwise calls `createServerClient()` and `supabase.auth.exchangeCodeForSession(code)`; on error redirects to `/login?error=oauth`, on success redirects to `${origin}${safeNext}` (`/dashboard` by default, or `/reset-password` when the password-recovery flow set `?next=/reset-password`).

## Connectivity

Reached by clicking the link in a Supabase-sent email (OAuth redirect or password-recovery email) or completing a Google OAuth round trip; depends on `@/lib/supabase/server` (`createServerClient`) to perform the code exchange, then hands off to `/login` or `/dashboard` (or the recovery page) via `NextResponse.redirect`.

## Parent

[auth](../README.md)

The `code` and `next` query values are parsed with `authCallbackQuerySchema` and `redirectPathSchema`.
