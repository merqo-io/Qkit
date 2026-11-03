# plan

## Purpose

Plan page. Shows the vendor's current tier, what it includes, a countdown for a running Event Pass, and a free / starter / qkit feature comparison. It shows no prices: plans are bought and changed in the vendor's Merqo account.

## Contents

- `page.tsx` - `PlanPage()` (server, `revalidate = 0`): resolves `entitlement` via `requireEntitledVendor()` and renders a tier badge, `PassCountdown` for a running Event Pass (or a dated notice for a scheduled one), the tier's one-line summary, a pointer to the Merqo account, and the local `FEATURES` array mapped into `@merqo/ui`'s `PlanComparisonTable` (Free / Starter / qkit).
- `page.dom.test.tsx` - asserts the comparison grid (header columns, row order, per-row check counts), that no price appears, and the scheduled-pass notice.
- `pass-countdown.tsx` - `PassCountdown({ expiresAt })` client component: live minute-ticking countdown formatted as `Xd Yh left` / `Xh Ym left` / `Xm left`, with the expiry in a fixed SGT string so server and client render the same text.

## Connectivity

Reachable from `dashboard-nav.tsx`'s account menu. Reads the entitlement from `@/lib/supabase/get-entitlement`, which resolves the cache Merqo pushes to `/api/merqo/entitlement`.

## Parent

[dashboard](../README.md)
