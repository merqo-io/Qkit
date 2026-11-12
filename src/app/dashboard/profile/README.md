# profile

## Purpose

Vendor account profile page — stall name, social links, profile icon, display name, and sign-in password, each saved independently through the channel that owns that data (shared `merqo.vendor_profile` for stall name/social links vs. the Supabase auth user for icon/display name/password).

## Contents

- `actions.ts` — `updateStallName(input)` and `updateSocialLinks(input)` server actions. Both validate with their Zod schema (`profileNameSchema`, `socialLinksSchema`), read the vendor's current shared profile via `getOrCreateVendorProfile`, then write the one changed field through `patchVendorProfile` — both from `@/lib/merqo/vendor-profile`, which calls the shared `merqo.vendor_profile` table's RPC functions (not a local `qkit.vendors` write; see `docs/superpowers/specs/2026-07-16-shared-vendor-profile-design.md`). Both call `revalidatePath("/dashboard", "layout")` so the header/account menu/booth forms immediately reflect the change. Display name, avatar, and password are explicitly **not** handled here — they live on the auth user and are set client-side via `supabase.auth.updateUser`.
- `page.tsx` — `ProfilePage()` (server, `revalidate = 0`): reuses the layout's primed `requireEntitledVendor()` cache, reads `display_name`/`avatar_url` defensively off `user.user_metadata`, and renders a `BackButton` plus `ProfileForm` with the vendor's stall name, display name, email, id, and avatar URL.
- `profile-form.tsx` — `ProfileForm({ stallName, displayName, email, vendorId, avatarUrl, socialLinks })` client component with five independently-saved sections inside `Section` blocks, laid out via `@merqo/ui`'s `TwoColumnSections` (`columnOne`/`columnTwo` props, each two independent `flex flex-col gap-5` stacks side by side on `md`+ — the same shared component `../settings/settings-form.tsx` uses). Neither a CSS grid (`md:grid md:grid-cols-2` — this page's own former layout: a grid's row height tracks the tallest cell in that row, so once "Social & website" outgrew "Stall name", every row after it started late in _both_ columns) nor multi-column `columns` (an earlier iteration still, which let a card's visual position drift from its reading order) — stacking each column independently avoids both failure modes. Column order is the standard for every kit's profile page, not just qkit's: left stacks stall name (`profileNameSchema` → `updateStallName` server action), profile icon (`ImageUploader` → `supabase.auth.updateUser({ data: { avatar_url } })`), and change password (`passwordChangeSchema` → `supabase.auth.updateUser({ password })`, clearing the fields on success); right stacks display name (`displayNameSchema` → `supabase.auth.updateUser({ data: { display_name } })`) above social links (`SocialLinksFields` + `socialLinksSchema` → `updateSocialLinks` server action); email is shown read-only.

## Connectivity

Reachable from `dashboard-nav.tsx`'s account menu ("Profile" item). `page.tsx` calls `requireEntitledVendor()` (`@/lib/supabase/get-entitlement`) and renders `profile-form.tsx`, which calls the server actions `updateStallName`/`updateSocialLinks` in `actions.ts` for stall name/social links and the browser Supabase client (`@/lib/supabase/client`) directly for avatar/display-name/password, all validated against schemas in `@/lib/schemas`.

## Shared package note

The avatar upload's resize step now calls `@merqo/ui`'s `resizeToWebp` (v0.31.0). v0.31.1 also fixes a latent bug there: a filename with no dot used to yield the whole name as its extension.

## Replaced-avatar cleanup

The avatar save handler deletes the previous image after successful replacement
or removal. An explicit refused save restores the preview and deletes the
unreferenced upload. An uncertain transport failure restores the preview but
preserves both possible saved images until refresh resolves the result.
Other profile writes show a field-specific transport message and retain input
for retry.

`profile-form.tsx` takes `FORM_LABEL_CLASS` and `FORM_ERROR_CLASS` from `@merqo/ui`.

## Parent

[dashboard](../README.md)

Shared name and social-link writes use field-specific patch_vendor_profile updates, preserving the other column under concurrent saves. Missing rows are provisioned atomically; empty social links explicitly clear links.
