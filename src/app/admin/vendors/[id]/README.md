# [id]

## Purpose

Per-vendor admin detail/management page, keyed by vendor id — the single place an admin reviews one vendor's activity and takes action (review the cached tier and Event Pass, resolve help requests).

## Contents

- `page.tsx` — `AdminVendorDetailPage({ params: Promise<{ id }> })` async server component (`revalidate = 0`). Gated by `requireAdmin()`; 404s via `notFound()` if the vendor doesn't exist. Fetches the vendor row, its booths, and licenses via the RLS-scoped client, plus this vendor's support messages from the shared `merqo.support_messages` table (filtered `kit_slug='qkit'` and `user_id=id`) via the service client (same RLS-membership-gap reason as `admin/page.tsx`'s message read) — all scoped to this one `id`, never a fleet-wide fetch, in parallel — then a follow-up scoped `orders` query keyed to the vendor's booth ids. Resolves the vendor's display name via `getOrCreateVendorProfile(merqoClient, id, null)` (`@/lib/merqo/vendor-profile`) against the shared merqo vendor-profile table — `qkit.vendors` itself has carried no `name` column since migration 0069. Derives health via `buildVendorHealth()`, active-pass hours-left via `passHoursLeft()`, revenue (sum of non-cancelled order totals), and an activation timeline (`Milestone` rows: signed up / created a booth / took first order / upgraded to Pro). Renders `Stat` tiles, the activation checklist, the vendor's help-request thread (each open one gets a `ResolveMessageButton`), and the `VendorManage` action panel plus a raw license history list.

## Connectivity

Reuses `Stat` from `../../stat`, `StatusChip` from `../../vendor-status`, `VendorManage` from `../../vendor-manage`, and `ResolveMessageButton` from `../../resolve-message-button` — all admin-folder-root components, not duplicated here. Linked to from each row of `admin/vendors/page.tsx`'s `VendorList`, and from help-request rows on `admin/page.tsx`.

## Parent

[vendors](../README.md)

Shared profile names are resolved with the service client only after the admin gate and vendor lookup succeed, so an absent profile can be provisioned without permitting ordinary vendors to create another vendor's profile.
