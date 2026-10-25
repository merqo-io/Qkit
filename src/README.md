# src

## Purpose

The Next.js application source.

## Contents

- `app/` — the Next.js App Router tree (pages, layouts, route groups, server actions).
- `components/` — cross-route shared UI, including shadcn/ui primitives.
- `hooks/` — cross-route shared React hooks (e.g. the realtime-orders subscription).
- `lib/` — framework-agnostic business logic, Zod schemas, DB types, and the Supabase clients `app/` depends on.
- `proxy.ts` — exports `proxy(request)`, which delegates to `updateSession` (`src/lib/supabase/middleware`) to refresh the Supabase session cookie and enforce route protection on every request; Next 16's middleware-equivalent. Its `config.matcher` runs on everything except `_next/static`, `_next/image`, `favicon.ico`, and static image extensions.

## Connectivity

`app/` is the Next.js App Router tree (pages, layouts, server actions); `components/` and `hooks/` hold cross-route shared UI and logic; `lib/` holds framework-agnostic business logic and the Supabase clients that `app/` depends on. `proxy.ts` runs before every matched request, refreshing the Supabase session and guarding vendor-only routes (e.g. bouncing an anonymous visitor from `/dashboard` to `/login`, as exercised by `e2e/auth-guard.spec.ts`).

## Parent

[qkit](../README.md)

`proxy.ts` sets the nonce CSP and, off production, `X-Robots-Tag: noindex`; see `lib/security-headers.ts`.
