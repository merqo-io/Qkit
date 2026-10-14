# new

## Purpose

Create-booth page — the plan-gated entry point for a vendor's first (or next) booth.

## Contents

- `page.tsx` — `NewBoothPage({ searchParams })` (server, `revalidate = 0`): counts the vendor's existing booths and redirects to `/dashboard/plan` if `canAddBooth(entitlement, count)` is false (RLS is the real backstop; this just avoids sending the vendor into a form that will fail to save), otherwise renders `BoothForm` (from `../booth-form`) with no `initial` data, passing the vendor's `social_links` as `vendorSocialLinks` for the form's "Social links" override section and what the vendor has on file in paykit (`vendorPaymentSetup`, `@/lib/paykit/payment-setup`) as `paymentSetup`, which the Payment section names read-only: the new booth still opens taking no payment. When `?mode=event` is present (the "Set up for an event" entry point), swaps the plain "New booth" heading for event-mode intro copy plus a "buy an event pass" link to `/dashboard/plan`, and passes `eventMode` down to `BoothForm` so its walk-up-default toggle (migration 0080) starts pre-checked.
- `page.dom.test.tsx` — RTL test (mocked `requireEntitledVendor`/`canAddBooth`/`createServerClient`, `BoothForm` stubbed) awaiting the async page component directly: the plain-mode heading + `eventMode: false` by default, the event-mode heading/copy/"buy an event pass" link + `eventMode: true` for `?mode=event`, that what paykit holds reaches the form with no stored setting, and that the plan-gate redirect still fires in event mode.

## Connectivity

Linked from the empty-state "Add your first booth" and "Set up for an event" CTAs on `realtime-order-board.tsx` and the "New booth" button on `booths/page.tsx`; renders the shared `booth-form.tsx`, which calls `saveBooth` in `../actions.ts` on submit and redirects back to `/dashboard/booths`.

## Parent

[booths](../README.md)
