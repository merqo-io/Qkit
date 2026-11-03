# vendors

## Purpose

Admin vendor list, pre-sorted by urgency, with drill-down into per-vendor management.

## Contents

- `page.tsx`, `AdminVendorsPage` async server component (`revalidate = 0`). Gated by `requireAdmin()`. Fetches vendors/vendor_entitlements/booths/orders via the RLS-scoped client, plus open support messages (`user_id`) from the shared `merqo.support_messages` table (filtered `kit_slug='qkit'`) via the service client (same RLS-membership-gap reason as `admin/page.tsx`'s message read), all in parallel; computes each vendor's health via `buildVendorHealth()` (`@/lib/admin/vendor-health`) and active-pass expiry via `latestActivePassByVendor()` (`@/lib/admin/stats`), builds `VendorListItem[]` sorted by `statusRank()` (most urgent first, ties broken by newest signup), and renders 4 `Stat` tiles (total vendors, "needs a look" count, on-a-live-pass count, 7d signups with delta) above the `VendorList`.
- `[id]/` — per-vendor detail/management page, keyed by vendor id.

## Connectivity

`page.tsx` is the fleet-wide triage list; each row links to `[id]/page.tsx` for the single-vendor deep dive and action panel. Reuses `Stat` from `../stat` and `VendorList`/`VendorListItem` from `../vendor-list`. Reachable via the "Vendors" tab in `admin/admin-nav.tsx`, under the `admin/layout.tsx` shell.

## Parent

[admin](../README.md)
