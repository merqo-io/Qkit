# `AGENTS.md` wording for the owner to apply (Separation P4)

`AGENTS.md` is a protected file, so P4 did not edit it. P4 makes three of its
passages partly stale. The replacement text is below; apply it by hand once
the qkit PR for P4 is merged. Plan:
[2026-10-13-payment-setup-in-paykit.md](2026-10-13-payment-setup-in-paykit.md).

## 1. Data model, the "Payments route through paykit" bullet

Replace the sentence that begins "`booths.payment` (JSONB) and
`orders.payment_status` (enum) are unchanged schema-wise" through the end of
the bullet with:

> `booths.payment` (JSONB) and `orders.payment_status` (enum) are unchanged
> schema-wise and still written. `booths.payment` holds only a `{kind}`
> marker (`pointer` or `paynow`); the PayNow and pointer details live in
> paykit's vendor-scoped `vendor_payment_config` and are entered in paykit's
> own dashboard only. qkit reads that config and never writes it.
> `orders.payment_status` is a local mirror of paykit's transaction state,
> not the primary record.

## 2. Project-Specific Notes, "paykit checkout cutover (2026-08-11)"

Replace "vendor PayNow/pointer config now saves to paykit's vendor-scoped
`vendor_payment_config` (`dashboard/booths/actions.ts`'s `saveBooth`, still
surfaced through the unchanged `PaymentSection` UI)" with:

> vendor PayNow/pointer config lives in paykit's vendor-scoped
> `vendor_payment_config` (written from qkit's booth form until 2026-10-13;
> see "Payment setup moved to paykit" below)

Replace the first bullet under "Two things deliberately were **not**
changed" with:

> - `booths.payment` still gets a minimal `{kind}` write (see `paymentPatch`
>   in `booths/actions.ts`): `qkit.place_order` and
>   `qkit.place_walkup_order` (SQL, migrations 0056/0060-61) read
>   `booths.payment->>'kind'` to decide a new order's initial
>   `payment_status`, and SQL cannot ask paykit.

## 3. Project-Specific Notes, "Follow-up gaps closed (2026-08-12)"

Replace everything from "and re-opening the booth-edit Payment section now
prefills" to the end of that paragraph with:

> and paykit's `GET /api/v1/vendors/{id}/config` (`getVendorConfig` in
> `paykit/client.ts`) returns the full config fields. qkit no longer
> prefills a form from it (see below); it reads only which kind is on file.

## 4. New note, to add after "Follow-up gaps closed"

> **Payment setup moved to paykit (2026-10-13, separation P4):** a vendor
> enters payment details in paykit only (owner's Decision 1A in
> `docs/superpowers/specs/2026-10-10-paykit-printkit-separation-design.md`).
> The booth form's `PaymentSection` is a switch ("Take payment for orders at
> this booth"), a read-only line from `vendorPaymentSetup`
> (`src/lib/paykit/payment-setup.ts`) and a link to paykit's
> `/dashboard/config?return_to=…`, which offers "Back to your booth" after a
> save. `saveBooth` writes the `{kind}` marker from the switch plus the kind
> paykit reports at save time; when paykit cannot be reached the stored
> marker is kept and the rest of the booth still saves. Deleted:
> `upsertVendorConfig`, `saved-vendor-payment.ts`, `paymentConfigSchema` (a
> `paymentMarkerSchema` remains), the `PaymentConfig` type and the `stripe`
> TypeScript kind (SQL keeps its check). Two things were kept on purpose:
> `sweepUnsavedUploads` still reads paykit's config, because a payment QR
> image uploaded through qkit before this change is still in `booth-images`
> and paykit still names it; and paykit's config write route
> (`POST /api/v1/vendors/{id}/config`) still exists, unused by qkit. A booth's
> marker is refreshed only when that booth is saved, so a method changed in
> paykit reaches each booth on its next save.

## 5. File Layout

No line needs changing. `src/lib/paykit/` is not listed there today; if it
is added, describe it as "HTTP client for paykit's `/api/v1/*`, plus
`payment-setup.ts` (what a vendor has on file, read-only)".
