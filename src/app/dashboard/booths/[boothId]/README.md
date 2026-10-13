# [boothId]

## Purpose

Edit-booth page, keyed by booth id, plus its printable QR code and
menu-manager sub-routes.

## Contents

- `page.tsx` — `EditBoothPage({ params })` (server, `revalidate = 0`): awaits `boothId` from `params`, loads the booth (`name, image_url, is_active, hours, menu_items, payment, social_links, requires_arrival_confirm, walkup_default, print_enabled, paykit_booking_id`) RLS-scoped so a foreign id resolves to `null` → `notFound()`, parses stored JSON via `parseMenuItems`/`parseBoothHours`/`parseSocialLinks` (`menu_items` only for its own item _count_, passed as `menuItemCount` — the items themselves are edited on `menu/`, not here), and renders `BoothForm` (from `../booth-form`) pre-filled with the booth's data, passing the vendor's own `social_links` as `vendorSocialLinks` (so the "Social links" section can seed a new override from the vendor's defaults). `vendorPaymentSetup` (`@/lib/paykit/payment-setup`, shared with `../new/`) reads what the vendor has on file in paykit and is passed to `BoothForm` as `paymentSetup`, for the Payment section's read-only summary. `takes_payment` comes from the booth's own `{kind}` marker alone (`expectsPayment(paymentKindOf(booth.payment))`): paykit's config is vendor-wide, so it never switches a booth on by itself, and a booth saved with no payment opens off whatever is on file. When paykit cannot be reached the setup is `unreachable` and the switch still shows the stored marker. `bookingStatus` is built by the local `initialBookingStatus`, which calls `getBookingStatus` (`@/lib/paykit/client`) when `booth.paykit_booking_id` is set and passes its result straight to `BookingStatusSection`; `null` (no id set, or paykit's read failed/degraded) means that section shows only the input field, never an error.
- `qr/` — the printable QR-code poster sub-route for this specific booth.
- `menu/` — the dedicated menu-manager sub-route (items, CSV export/import, drag reorder) for this specific booth.

## Connectivity

`page.tsx` is the edit form (the shared `booth-form.tsx` pre-filled with this booth's data, saved via `saveBooth`/`deleteBooth` in `../actions.ts`); `qr/` is the printable QR-code sub-route for this specific booth, linked from `booth-list.tsx`'s QR button; `menu/` is the menu-manager sub-route, linked from `booth-form.tsx`'s "Manage menu" link once the booth has an id.

## Parent

[booths](../README.md)
