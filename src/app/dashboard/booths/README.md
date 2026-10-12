# Booth management

Vendor booth creation, editing, menus, QR posters and printing configuration.
All vendor writes use the session client and tenant RLS. Server actions validate
input and recheck plan entitlements; migration 0101 additionally enforces the
free-plan total-booth cap under concurrent writes.

## Entry points

- `page.tsx` lists booths; `booth-list.tsx` supplies edit, QR, copy-link and
  public queue-display actions.
- `new/page.tsx` renders `BoothForm` after the plan gate. `?mode=event`
  seeds walk-up mode for a new booth.
- `[boothId]/page.tsx` loads an owned booth and payment/booking configuration.
- `[boothId]/menu/` owns item and category editing through `MenuManager`.
- `[boothId]/qr/` renders printable/downloadable posters and confirmed QR
  rotation. Rotating the code invalidates existing printed links.

## Editors and writes

`BoothForm` composes hours, order-flow, payment, printing, booking and social
link editors. It saves booth metadata through `saveBooth`; a successful new
booth proceeds to menu setup, whose first save proceeds to the QR poster.

`MenuManager` handles CSV preview/import/export and saves items and categories
through `saveMenuItems` and `saveMenuCategories`. `MenuEditor` owns grouping,
item/section reorder, availability and duplication. Its pure ordering rules
live in `menu-order.ts`, its drag-and-drop wrappers in `menu-sortables.tsx`
and an item's price, cost, sold-out limit and section row in
`menu-item-fields.tsx`; `OptionGroupsEditor`
owns choices, prices, costs and allergens. These are the exclusive application
write paths for menu columns; a booth-metadata save does not overwrite them.
Item and category writes are separate operations, so callers handle partial
success and retain retry availability.

`actions.ts` also exposes `toggleBoothActive`, `regenerateShortCode` and
`deleteBooth`. Deleting a booth cascades to its orders; the editor requires an
explicit confirmation. `CloseBoothControl` uses a confirmation and three-second
hold to close an existing booth, with a reversible undo; reopening is immediate.

The payment editor writes full configuration to Paykit; the booth retains only
its minimal payment-kind marker. Printing registration is best effort after a
successful booth save/delete, and nothing from Printkit's answer is stored on
the booth (`booths.printkit_location_id` is an unused column). The Printing
section is a switch, a status badge and one link. The link's address is the
`manage_url` Printkit sends with the status, so qkit builds no Printkit path
and carries no printer advice; both live in Printkit. `usePrinterStatus` polls qkit's authenticated
server route, which asks Printkit; no integration secret reaches the browser.
A status is an operational hint, not payment confirmation or proof of delivery.

## Image lifecycle

Banner, menu and payment-QR images are previewed locally until Save. The browser
commits pending images, validates the resulting values and calls the action.

- An upload failure cleans up completed uploads and stops the save.
- An explicit save refusal cleans up uploads that no persisted record references.
- A booth save can update Paykit before its local booth write fails; cleanup
  preserves any payment QR already referenced by Paykit.
- An uncertain transport failure retains uploads because the write may have
  committed. Entered values remain available for recovery.

`sweep-unsaved-uploads.ts` is a best-effort backstop for old unreferenced objects
in the vendor's own storage folder. It checks booth, avatar and Paykit references
and skips deletion when a required read fails. Successful saves schedule it
outside the critical response path.

## Verification

Colocated action tests cover ownership, validation, plan gates, integration
failures and image cleanup. DOM tests cover editing, CSV preview, customization,
QR confirmation, close/undo controls and printer-status states. SQL fixtures
cover database cap concurrency separately; mocked application tests do not
establish database enforcement or physical printer operation.

[Dashboard](../README.md)

## Order limits and payment prefill

Booth settings include a per-order item limit alongside the daily cap. Vendor-wide
Paykit details prefill only booths with their own payment-kind marker; a booth
with no marker stays payment-free. New and existing booth forms share the saved
payment loader, and selecting a method restores those details. Booking and
payment-prefill requests run concurrently. Menu CSV import/export also preserves
item and option short codes.
