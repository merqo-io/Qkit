# login

## Purpose

Vendor sign-in page — combines email/password sign-in, sign-up, Google OAuth, and password-reset-request into a single client component so a vendor never has to navigate away to switch modes.

## Contents

- `page.tsx` — default-exports `LoginPage`, which wraps `LoginForm` in a `Suspense` boundary (needed for `useSearchParams`). `LoginForm` (`"use client"`):
  - Reads `?mode=signup` from the URL to pick the initial `Mode` (`"signin"` | `"signup"`), toggled thereafter by a text button.
  - `loginSchema` (`@/lib/schemas`) + `react-hook-form`/`zodResolver` validate the `email`/`password` fields.
  - `signInWithGoogle()` calls `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: ".../auth/callback" })`.
  - `onSubmit` calls `supabase.auth.signUp` or `supabase.auth.signInWithPassword` depending on `mode`; on sign-up with email confirmation required (no session returned), it shows a "check your email" panel instead of redirecting; otherwise it routes to `/dashboard` and refreshes.
  - `sendReset()` validates the email field alone, then calls `supabase.auth.resetPasswordForEmail` with `redirectTo` pointing at `/auth/callback?next=/reset-password`, and shows the same "check your email" panel (reset variant).
  - Async submissions run through `useAsyncAction` (`@/hooks/use-async-action`) for pending/loading state and `navigatingAway()` to avoid a state update after navigation.
  - UI is built from `Ticket`, shadcn `Button`/`Input`/`Label`, and `sonner` toasts for Supabase error messages.

## Connectivity

Imports `loginSchema`/`LoginInput` from `src/lib/schemas.ts`, the browser Supabase client from `src/lib/supabase/client.ts`, and `useAsyncAction`/`navigatingAway` from `src/hooks/use-async-action.ts`. Successful sign-in/sign-up navigates to `/dashboard` (guarded by `src/proxy.ts`); the reset-request path hands off to `src/app/auth/callback` → `src/app/(auth)/reset-password/`. Google OAuth also flows through `/auth/callback`.

## Shared package note

`google-mark.tsx` moved to `@merqo/ui` (v0.31.0) as `GoogleMark` — it was byte-identical in all five repos.

## Parent

[(auth)](../README.md)

The two `Wordmark` uses pass `size="lg"` and `size="xl"` so the shared wordmark shell keeps the previous text sizes.
