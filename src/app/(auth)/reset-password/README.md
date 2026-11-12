# reset-password

## Purpose

Password-reset page reached from a Supabase recovery-email link — lets a vendor set a new password once Supabase has established a recovery session.

## Contents

- `page.tsx` — `ResetPasswordPage` server component (`revalidate = 0`). Renders the qkit brand lockup and hands off to `ResetPasswordForm`; no data fetching of its own.
- `reset-password-form.tsx` — `ResetPasswordForm` client component. On mount calls `supabase.auth.getUser()` to check whether a recovery session exists (`"checking" | "ready" | "no-session"` state). If no session, shows an expired-link message with a link back to `/login`. If ready, renders a form validated with `passwordChangeSchema` (from `@/lib/schemas`); on submit calls `supabase.auth.updateUser({ password })`, toasts success/failure, then `router.push("/dashboard")` + `router.refresh()`, awaiting `navigatingAway()` from `@/hooks/use-async-action` to avoid a state update after navigation.

## Connectivity

Reached after `/auth/callback` exchanges the Supabase recovery-link code for a session and forwards here (see `src/app/auth/`). `reset-password-form.tsx` talks directly to Supabase Auth via `createClient()` (`@/lib/supabase/client`) rather than a server action — password update is a client-side Supabase Auth call. On success it redirects into `/dashboard`.

`reset-password-form.tsx` takes `FORM_LABEL_CLASS` and `FORM_ERROR_CLASS` from `@merqo/ui`.

## Parent

[(auth)](../README.md)
