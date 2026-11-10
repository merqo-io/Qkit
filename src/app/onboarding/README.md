# onboarding

## Purpose

First-run vendor setup — collects the stall name right after account creation,
before a vendor row exists, so a fresh sign-up has somewhere to land besides a
broken dashboard.

## Contents

- `actions.ts` — `createVendor(input)` server action: validates `input`
  against `vendorSchema`, requires a signed-in user, then inserts a bare
  `{ id: user.id }` row into `vendors` (the table has carried no `name`
  column since migration 0069). Treats Postgres unique-violation (`23505`,
  i.e. the row already exists) as success rather than an error, so a
  double-submit or back-nav retry is harmless. On both the fresh-insert and
  the already-exists path, seeds the chosen stall name into the shared merqo
  vendor-profile table via `getOrCreateVendorProfile(supabase, user.id, name)`
  (`@/lib/merqo/vendor-profile`, idempotent).
- `onboarding-form.tsx` — `OnboardingForm` client component: a single
  "Stall name" input (`react-hook-form` + `zodResolver(vendorSchema)`) inside
  a `Ticket` card, styled as "Step 1 of 1". On submit calls `createVendor`
  then `router.replace("/dashboard")` (replace, not push, so Back can't
  return to onboarding) and awaits `navigatingAway()` to keep the pending
  state visible through the navigation.
- `page.tsx` — `OnboardingPage` (route entry, `revalidate=0`): redirects to
  `/login` if unauthenticated, to `/admin` if the user is an admin, to
  `/dashboard` if a vendor row already exists — otherwise renders
  `OnboardingForm`.
- `loading.tsx` — centred-card skeleton shown while the page awaits `getVendor` and `isAdmin`.
- `loading.dom.test.tsx` — status role, accessible "Loading" label and the hidden decorative skeleton.

## Connectivity

Reached at `/onboarding`, typically right after sign-up (see the `(auth)`
route group). `onboarding-form.tsx` calls this folder's own
`actions.ts#createVendor`; the resulting `vendors` row is what
`page.tsx`'s own guard (and `requireEntitledVendor()` elsewhere) checks for
on every subsequent visit to gate dashboard access. A fresh vendor with no
booths yet lands on `/dashboard`'s own "No booths yet" empty state
(`dashboard/realtime-order-board.tsx`), which is where the "Set up for an
event" alternative to "Add your first booth" lives — not here, since this
page has nothing booth-related of its own to gate.

## Parent

[app](../README.md)
