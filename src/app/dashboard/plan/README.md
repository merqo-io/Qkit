# plan

## Purpose

Plan page. Shows the vendor's current tier, a countdown for a running Event Pass, and merqo's plan ladder with live prices. Plans are bought and changed in the vendor's Merqo account; qkit stores no prices.

## Contents

- `page.tsx` - `PlanPage()` (server, `revalidate = 0`): resolves `entitlement` via `requireEntitledVendor()` and renders a tier badge, `PassCountdown` for a running Event Pass (or a dated notice for a scheduled one), a pointer to the Merqo account, and `@merqo/ui`'s `PricingLadder` fed by `fetchPlanCatalog(MERQO_BASE_URL)`, with qkit highlighted and the vendor's tier marked through `descriptions`. A null catalog renders the current plan and a "prices unavailable" line.
- `page.dom.test.tsx` - mocks `fetchPlanCatalog`; asserts the ladder, qkit highlight, current-tier marker, the null-catalog fallback with no price text, and the scheduled-pass notice.
- `pass-countdown.tsx` - `PassCountdown({ expiresAt })` client component: live minute-ticking countdown formatted as `Xd Yh left` / `Xh Ym left` / `Xm left`, with the expiry in a fixed SGT string so server and client render the same text.

## Connectivity

Reachable from `dashboard-nav.tsx`'s account menu. Reads the entitlement from `@/lib/supabase/get-entitlement`, which resolves the cache Merqo pushes to `/api/merqo/entitlement`.

## Parent

[dashboard](../README.md)
