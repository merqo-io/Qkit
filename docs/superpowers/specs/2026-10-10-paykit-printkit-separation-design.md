# Paykit and Printkit Separation: Design

Date: 2026-10-10. Status: decisions made by the owner on 2026-10-10 (option A
on all three, see "Decisions for the owner"). No code has changed in any repo.

## What was asked

The owner, 2026-10-09: "the bank auto detect should be under paykit instead of
qkit right? we should separate printkit and paykit stuffs from qkit."

Intended outcome: qkit holds only what an order needs, which is a status
mirror and a call to the other kit. Payment mechanics, payment evidence and
payment detection belong to paykit. Print mechanics and printer knowledge
belong to printkit.

This document is Phase A: an audit of what qkit owns today, a verdict for each
piece, and a phased plan where each phase ships as one PR per repo.

## How the audit was done

Read on 2026-10-10 at qkit `4b05c8b`, paykit `a32c6c3`, printkit `eeb16a1`.
`AGENTS.md` was read in all three repos. paykit and printkit have no
`docs/CONSTITUTION.md`; their `AGENTS.md` "Rules (always)" section is the
equivalent. No open PRs existed on `merqo-io/Qkit`, `merqo-io/paykit` or
`merqo-io/printkit` at the time, so nothing from Codex overlaps yet.

Everything below is from reading code. Nothing was run against a live
deployment, so the two defects in "Problems found" are unconfirmed in
production and each needs a failing test before its fix.

## The boundary

| Concern                                                                      | Owner    |
| ---------------------------------------------------------------------------- | -------- |
| Does a new order owe payment, and what happens to the order when it is paid  | qkit     |
| `orders.payment_status`, `payment_method_kind`, `paid_at` as a local mirror  | qkit     |
| Payment details, checkout rendering data, transaction state, evidence, proof | paykit   |
| Detecting that money arrived, by any means                                   | paykit   |
| Does this booth print, and what an order's print state is (`print_status`)   | qkit     |
| Which label number and name go on a ticket                                   | qkit     |
| Printers, connectors, label layout, delivery, printer health, printer advice | printkit |

A qkit file passes the boundary when it does one of three things: calls the
other kit, mirrors a status the other kit reported, or applies an order rule to
that status.

## Audit

Verdicts: **Stays** (already thin, or an order rule), **Moves** (to the other
kit, with the form it takes), **Duplicated** (the same logic exists in both
kits today).

### Payments

| Item                                                                               | What it does today                                                                                                                                  | Verdict                                                                                                                            | Phase |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `src/lib/paykit/client.ts`                                                         | Bearer HTTP client, Zod on every response, never throws                                                                                             | Stays. It is the seam.                                                                                                             | P1    |
| `createCheckout` used as a lookup                                                  | `confirmOrderPayment`, `confirmPaymentAndStart` and `unclaimPayment` call create-checkout only to learn the transaction id                          | Moves to a paykit lookup endpoint. See Problem 1.                                                                                  | P1    |
| `src/lib/payment-marker.ts`, `booths.payment` `{kind}`                             | Tells SQL whether a booth takes payment                                                                                                             | Stays. Order rule, and SQL cannot call paykit.                                                                                     | none  |
| `qkit.place_order`, `qkit.place_walkup_order` (latest in `0095`)                   | `v_expects_payment := kind is not null and kind <> 'stripe' and total > 0`; decides initial `payment_status` and defers the order number            | Stays. This is the order's own policy. No migration.                                                                               | none  |
| `qkit.assign_order_number`, abandoned-payment sweep (`0097`), `isAbandonedPayment` | Numbers an order on claim; cancels an order unpaid after 30 minutes                                                                                 | Stays. Order lifecycle.                                                                                                            | none  |
| `payment-actions.ts` `claimPayment`, proof half                                    | Validates the screenshot, hashes it, uploads to qkit's private `payment-proofs` bucket, writes `orders.payment_proof_path` and `payment_proof_hash` | Moves to paykit as an API. A screenshot is evidence about a transaction.                                                           | P3    |
| `payment-actions.ts` `claimPayment`, order half                                    | Calls paykit claim, assigns the number, notifies vendor and printkit, writes the mirror                                                             | Stays.                                                                                                                             | P2    |
| `dashboard/proof-actions.ts`                                                       | Signed URL for the proof photo; finds another order with the same hash                                                                              | Moves to paykit as an API. Duplicate detection is payment detection.                                                               | P3    |
| `components/board/payment-proof-viewer.tsx`                                        | Runs Tesseract OCR in the vendor's browser, parses dollar amounts out of the screenshot, compares to the order total                                | Moves to paykit as a signal on the transaction. This is the nearest thing to "bank auto detect" that exists, and it lives in qkit. | P3    |
| `public/tesseract/` (16 MB), `tesseract.js`, `tesseract.js-core`                   | OCR engine and model, self-hosted for the CSP                                                                                                       | Moves with the OCR, subject to Decision 3.                                                                                         | P3    |
| `dashboard/booths/payment-section.tsx` (393 lines)                                 | Full PayNow and payment-link setup form                                                                                                             | Duplicated. paykit has its own `dashboard/config/payment-config-form.tsx` for the same vendor-wide record.                         | P4    |
| `paymentConfigSchema` in `src/lib/schemas.ts`                                      | Validates the same fields paykit validates                                                                                                          | Duplicated, and the two have drifted. See Problem 2.                                                                               | P4    |
| `saved-vendor-payment.ts`, `upsertVendorConfig`, `getVendorConfig`                 | Reads and writes paykit's config so the qkit form can edit it                                                                                       | Moves with the form. `getVendorConfig` stays for a read-only summary.                                                              | P4    |
| Pointer QR image upload                                                            | The vendor's own payment QR image is uploaded to qkit's `booth-images` bucket and paykit stores that URL                                            | Moves. paykit's payment config should not depend on qkit's storage.                                                                | P4    |
| `stripe` kind in `PaymentKind`, `stripeConfigSchema`                               | Reserved, never selectable                                                                                                                          | Duplicated intent. paykit now has the `PaymentProvider` seam for this. Remove the TypeScript side; SQL keeps its harmless check.   | P4    |
| `order/[boothId]/pay/pay-form.tsx`, `qr-image.ts`                                  | Customer pay step: renders the QR, link or image, "Save QR image", screenshot upload, "I've paid"                                                   | Moves to a paykit hosted page, subject to Decision 2.                                                                              | P5    |
| `dashboard/walkup-pay-step.tsx`                                                    | Vendor-facing QR in the walk-up dialog, "Payment received" and "Collect later"                                                                      | Stays. It is a counter screen inside the board, and after P5 it is qkit's only renderer.                                           | P5    |
| `order/[boothId]/[orderNumber]/pay-panel.tsx`                                      | Shows claimed or confirmed, polls the local mirror, "Undo"                                                                                          | Stays. Reads the mirror only.                                                                                                      | none  |
| `dashboard/order-actions.ts` `confirmOrderPayment`, `confirmPaymentAndStart`       | Vendor confirm: paykit confirm, then mirror, then audit                                                                                             | Stays, apart from the lookup change in P1.                                                                                         | P1    |
| `booking-status-section.tsx`, `getBookingStatus`, `booths.paykit_booking_id`       | Read-only view of a paykit booking                                                                                                                  | Stays. Already thin.                                                                                                               | none  |
| `stats.ts`, sales summary, board badges reading `payment_status`                   | qkit reporting on its own mirror                                                                                                                    | Stays.                                                                                                                             | none  |

The two QR renderers (`pay-form.tsx` for the customer, `walkup-pay-step.tsx`
for the vendor) share the three-way `qr` / `link` / `image` switch and differ in
everything else: size, copy, save button, and a payment link is a button for
the customer but a QR of the link at the counter. With P5 the customer one
leaves qkit and there is nothing left to merge. If P5 is declined, they merge
into one local component instead (see Decision 2).

### Printing

| Item                                                                   | What it does today                                                                                                                                | Verdict                                                                                                     | Phase |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----- |
| `src/lib/printkit/client.ts`                                           | Bearer HTTP client: create job, register location, read printer status                                                                            | Stays.                                                                                                      | none  |
| `o/[code]/notify.ts` `notifyPrintkit`                                  | Picks the label number and stored name, creates the job, marks `print_status` queued                                                              | Stays. qkit decides what goes on the ticket; printkit lays it out.                                          | none  |
| `api/printkit/print-status/route.ts`, `qkit-printkit-auth.ts`          | Inbound callback that mirrors `printed` or `failed`                                                                                               | Stays. The payload names the order `order_id`, a qkit word inside printkit's generic callback.              | R1    |
| `api/printkit/printer-status/route.ts`, `use-printer-status.ts`        | Session-checked proxy so the browser never holds the printkit secret                                                                              | Stays.                                                                                                      | none  |
| `booths.print_enabled`, `v_needs_accept := ... OR NOT b.print_enabled` | A booth that prints starts orders without a manual accept                                                                                         | Stays. Order rule keyed on qkit's own toggle. No migration.                                                 | none  |
| `orders.print_status`, `PrintBadge` on the ticket                      | Mirror and its display                                                                                                                            | Stays.                                                                                                      | none  |
| `dashboard/booths/printing-section.tsx`                                | Toggle, status badge, and: two hardcoded printkit routes (`/dashboard/printers`, `/guides/bluetooth-printers`) plus a paragraph of printer advice | Moves in part. The advice and the knowledge of printkit's routes belong to printkit. Toggle and badge stay. | R1    |
| `booths.printkit_location_id`                                          | Written after registering a location; read into the form's props; nothing acts on it. printkit keys locations on the booth id (`source_ref`).     | Duplicated state with no reader. Stop reading and writing it; leave the column.                             | R1    |
| Booth form "Printing" section in `booth-form.tsx`                      | Mounts `PrintingSection`, passes `print_enabled`                                                                                                  | Stays.                                                                                                      | none  |

Printing is already close to the boundary. One printkit phase finishes it.

## Problems found

1. **A vendor who edits payment details cannot confirm orders already
   awaiting payment.** qkit stores no transaction id, so confirm and undo call
   `POST /api/v1/checkout` again and rely on its idempotent replay. paykit's
   replay (`src/lib/checkout.ts`, `replayConflict`) answers 409 "Payment
   configuration changed since checkout creation" when the rendered payload no
   longer matches the stored one. qkit then shows "Failed to confirm payment".
   Read from code; not reproduced. Fixed by P1.
2. **The two kits disagree on what a valid UEN is.** qkit requires 9 to 10
   characters ending in a letter and documents why: an 8-digit mobile typed
   into the UEN box otherwise passes and produces a QR bank apps reject. paykit
   accepts any 8 to 12 alphanumerics. They also differ on a payment link plus
   QR image together (qkit: at least one; paykit: exactly one). A vendor gets
   different answers depending on which form they used. Fixed by P4; the UEN
   rule is fixed in paykit in P1.
3. **A cancelled or expired qkit order leaves a `pending` transaction in paykit
   forever.** paykit has no void or expiry. Harmless while a human confirms
   every payment. Unsafe once paykit detects payments by itself, because a late
   payment could match an order qkit already gave up on. Fixed as a
   prerequisite of P6.
4. **The booth marker can disagree with paykit.** Payment config is one record
   per vendor. A booth's marker is written only when that booth is saved, so
   changing the method from another booth, or from paykit's dashboard, leaves
   the first booth's `kind` stale. The "owes payment" decision stays right;
   only `orders.payment_method_kind` can be wrong. P4 narrows this; it does not
   remove it. Accepted.

## Decisions for the owner

Each has a recommendation. Phases P1 to P3 and R1 do not depend on them.

**Outcome, 2026-10-10.** The owner chose the recommendation on all three:
payment details are entered only in paykit (1A), the customer pays on a page
hosted by paykit (2A), and P3 starts with a server-side OCR spike in paykit
with the qkit viewer as the fallback (3A). The owner also accepted that P6
needs paykit's no-auto-verify rule amended; that edit is theirs to make when
P6 starts and has not been made. The options are kept below as the record of
what was weighed.

**Decision 1. Where does a vendor enter payment details?**

- **A (recommended): only in paykit.** qkit's booth form shows a switch ("Take
  payment for orders at this booth"), a one-line read-only summary of what
  paykit has on file, and a link to paykit's config page that returns to the
  booth afterwards. Same pattern printing already uses for choosing a printer.
  One form, one validator, no drift. Cost: it reverses the August "quick add
  PayNow inside qkit" choice, and a new vendor makes one trip to paykit.
- B: keep the quick-add form in qkit, delete qkit's duplicate rules, and let
  paykit be the only validator (qkit shows paykit's error). Less removed, no
  trip to paykit, two forms to keep visually in step.

**Decision 2. Where does the customer pay?**

- **A (recommended): a page hosted by paykit.** qkit creates the checkout with
  a return address and sends the customer to paykit, which shows the QR, takes
  the screenshot, and sends them back. Every kit gets the same pay page, and a
  future "payment detected" state appears with no qkit work. Cost: the customer
  crosses to another `merqo.io` host mid-order, and paykit gains its first
  public page, which needs its own token and abuse limits.
- B: the pay step stays in qkit. Then merge `pay-form.tsx` and
  `walkup-pay-step.tsx` into one local `PaymentCode` component (one qkit PR, no
  paykit change), and qkit adds its own "payment detected" state later.

**Decision 3. Where does the screenshot amount check run?**

- **A (recommended): try it in paykit's server first.** P3 starts with a
  time-boxed spike: run the same OCR inside a paykit route at claim time. If it
  works on Vercel, paykit returns `amount_match` and qkit deletes Tesseract.
  The 2026-09-13 payment-first spec recorded known trouble running
  `tesseract.js` on Vercel, so this may fail.
- B (the fallback if the spike fails): OCR stays in qkit's proof viewer as it
  is, reading the photo from paykit, and is deleted when P6 replaces it.

**One rule change, needed only for P6.** paykit's `AGENTS.md` says: "Do not
add a payment-provider SDK, a webhook that moves money, or a real auto-verify
integration." Bank auto detect is an auto-verify integration. Building it
needs the owner to amend that rule. It is a protected file and this spec does
not touch it.

## Phases

Order of work inside every phase: the paykit or printkit PR first, additive
and backwards compatible, merged and deployed; then the qkit PR. A qkit PR
never merges before the endpoint it calls is live. Before starting any phase,
check for open PRs on the repos it touches and wait for them.

Every qkit PR that changes the paykit contract also updates
`e2e/paykit-mock.ts`, which stands in for paykit in qkit's e2e run.

### P1. Look up a transaction, do not re-create it

Goal: qkit stops using create-checkout as a lookup. Fixes Problem 1 and the
UEN half of Problem 2.

paykit PR:

- `GET /api/v1/checkout?order_ref=<ref>`, bearer kit auth, scoped to the
  calling kit's slug. Uses the existing unique `(kit_slug, order_ref)` index.
- paykit's UEN rule is tightened so an 8-digit mobile number can no longer be
  saved as a UEN. As shipped it accepts a UEN (9 to 10 characters, ending in
  a letter) with an optional 3-character suffix, because PayNow Corporate
  lets a business append one and paykit's old rule accepted it. That is
  slightly wider than qkit's own form rule, which accepts only the bare UEN;
  qkit's rule is left alone since P4 removes that form. Before tightening,
  the owner checked existing `vendor_payment_config.uen` values against the
  bare-UEN rule: no row failed it.

qkit PR:

- `getCheckoutByOrderRef(orderRef)` in `src/lib/paykit/client.ts`.
- `confirmOrderPayment`, `confirmPaymentAndStart`, `unclaimPayment` and the
  claim step of `claimPayment` use it, through one helper. `claimPayment` was
  added while planning: it has the same defect from the customer's side (paid,
  then cannot record it). The pay page itself keeps calling create-checkout,
  since it needs the view to render.
- The helper falls back to create-checkout when the lookup answers 404 (a
  walk-up order whose pay step never loaded) or 405 (a paykit deployment that
  does not have the route), so qkit behaves as it does today in both cases.
- The helper refuses a transaction whose amount differs from the order's
  total, or whose vendor differs from the vendor the action is acting for.
  Create-checkout enforced both through its replay check; the lookup must
  not lose either. The vendor check was added after the whole-branch review:
  qkit's admin read policy lets an admin account load another vendor's order
  through the session client, and without the check such an account could
  confirm that vendor's transaction in paykit.

Contract:

```
GET /api/v1/checkout?order_ref=<string, 1..200>
200 { transaction_id, status: "pending"|"claimed"|"confirmed", amount_cents,
      order_ref, kit_slug, vendor_id, claimed_at, confirmed_at, created_at,
      view: { type: "qr", payload } | { type: "link", url, label }
          | { type: "image", url } | null }
404 { error }   no transaction for this kit and order_ref
```

`view` is the stored snapshot, never re-rendered from current config. It is
`null` for rows older than paykit migration `0018`.

Migration: none in either repo.

Verified by: a failing qkit test first (confirm after a config change), then
green. paykit contract test for the new route. `pnpm check && pnpm test` in
both. qkit `pnpm test:e2e` against the updated mock.

### P2. paykit tells qkit when a payment changes

Goal: the one seam every later payment phase and bank auto detect rely on.
Today qkit only learns about a payment change it caused itself.

paykit PR:

- `kit_api_keys` gains `callback_url` and `callback_secret`, the same shape
  printkit added in its migration `0006`.
- After a claim, unclaim or confirm commits, paykit posts to the calling kit's
  callback. Fire and forget, 5 second timeout, never fails the request.

qkit PR:

- `POST /api/paykit/payment-status`, guarded by a new `PAYKIT_CALLBACK_SECRET`
  with a constant-time compare and a rate limit, the same build as
  `api/printkit/print-status`.
- The handler trusts only `order_ref` from the body. It then reads the real
  status from paykit with P1's lookup and applies it. A replayed, reordered or
  forged body can therefore never set a status paykit does not hold, and no
  timestamp column is needed to order events.
- `claimPayment`'s order half becomes one idempotent function,
  `finalizePaidOrder(orderId)`: assign the number (already idempotent in SQL),
  notify the vendor, send the print job, write the mirror. The action and the
  callback both call it.

Contract:

```
POST <callback_url>      Authorization: Bearer <callback_secret>
{ order_ref, transaction_id, status: "pending"|"claimed"|"confirmed" }
200 { ok: true }   401   404 unknown order   429
```

Rules qkit applies to the status it reads back: `claimed` or `confirmed` on an
order with no number runs `finalizePaidOrder`; `confirmed` sets `paid_at`;
`pending` reverts a `claimed` mirror; a cancelled order is never changed and
is logged.

Migration: paykit only (two nullable columns). qkit none. The owner sets
`PAYKIT_CALLBACK_SECRET` in Vercel and the matching `kit_api_keys` row; the
agent never reads or writes env files.

Verified by: route tests copying the print-status suite (auth, rate limit,
unknown order, cancelled order, idempotent repeat). Unit tests for
`finalizePaidOrder` called twice. Manual on a preview: a QR order on
**TEST · PayNow**, confirm from the board, confirm the customer page updates.
Not on TEST · Printing.

### P3. Proof and detection signals move to paykit

Goal: the screenshot, its hash, the duplicate check and the amount check
belong to the transaction, not the order.

paykit PR:

- Private bucket `paykit-payment-proofs`. The name must differ from qkit's
  `payment-proofs` because both kits share one Supabase project.
- Table `paykit.payment_evidence`: `transaction_id`, `kind`
  (`'screenshot'` now; P6 adds its own kinds), `storage_path`, `content_hash`,
  `detail jsonb`, `created_at`. Vendor reads own rows through the transaction;
  writes are service-role only.
- `POST /api/v1/checkout/{id}/claim` accepts an optional `multipart/form-data`
  body with one `proof` file (JPEG, PNG or WebP, at most 1 MB, the limits qkit
  enforces today). A claim with no body keeps working.
- `GET /api/v1/checkout/{id}/evidence`.

qkit PR:

- `claimPayment` forwards the file to paykit and no longer touches its own
  bucket. A 1 MB file is inside Vercel's request limit.
- `PaymentProofViewer` reads through one server action that checks order
  ownership with the vendor's session (RLS), then calls paykit.
- New orders stop writing `payment_proof_path` and `payment_proof_hash`. The
  columns and the old bucket stay. Orders that already have a path keep
  working through the existing `proof-actions.ts` read, which is deleted in a
  later cleanup once no open order uses it.
- Per Decision 3: delete `public/tesseract/` and both Tesseract packages, or
  keep the viewer's OCR unchanged.

Contract:

```
GET /api/v1/checkout/{id}/evidence
200 { proof_url: string | null,         signed, expires in 300 s
      signals: {
        duplicate_of: { order_ref, kit_slug } | null,
        amount_match: boolean | null     null means not checked
      } }
```

`duplicate_of` matches the same `content_hash` on another transaction of the
same vendor, across every kit. qkit shows the other order's number when
`kit_slug` is `qkit`.

Migration: paykit only (bucket, storage policy, one table). qkit none.

Verified by: paykit route and RLS tests (a vendor cannot read another vendor's
evidence). qkit action tests for forward, failure before claim leaves the order
untouched, and the legacy read. Manual on a preview with TEST · PayNow: upload
a screenshot, open it on the board, upload the same file on a second order and
see the duplicate warning.

### P4. Payment setup lives in paykit

Depends on Decision 1. Written here for option A.

paykit PR:

- `dashboard/config` accepts `return_to`, allowed only for Merqo family
  origins, and shows "Back to your booth" after a save.
- The pointer QR image uploads to paykit's own storage.

qkit PR:

- `PaymentSection` becomes: a switch, a read-only summary from
  `getVendorConfig`, a link to paykit. With nothing on file the switch is off
  and the link reads "Set up payments in paykit".
- `saveBooth` writes the marker from the switch plus the kind paykit reports.
  If paykit cannot be reached, the existing marker is kept and the rest of the
  booth still saves.
- Deleted: the form body, `paymentConfigSchema`'s field rules (a `{kind}`
  marker schema remains), `upsertVendorConfig`, `saved-vendor-payment.ts`, the
  `stripe` TypeScript kind, the payment QR path in `sweep-unsaved-uploads.ts`.

Contract: no new endpoint. `GET /api/v1/vendors/{id}/config` already returns
what the summary needs.

Migration: none. A payment QR image already stored in qkit's `booth-images`
keeps its URL in paykit's config until the vendor next replaces it.

Verified by: DOM tests for the three summary states (nothing on file, PayNow,
link or image) and the unreachable state. Action tests for marker writes.
Manual on a preview: toggle TEST · Walk-up on and off, confirm a new order's
payment state follows. No payment identifiers are typed by the agent.

All new copy is checked by the existing no-em-dash lint gate.

### P5. The customer pays on a paykit page

Depends on Decision 2. Written here for option A. Needs P2 and P3.

paykit PR:

- `POST /api/v1/checkout` accepts optional `return_url` and `title`, and
  returns `pay_url`.
- Public page `/pay/{transaction_id}?k=<token>`: amount, title, the QR, link
  or image, "Save QR image", screenshot upload, "I've paid", and a redirect to
  `return_url` once claimed or confirmed. The token is random, stored hashed,
  and required: a transaction id alone opens nothing.
- `return_url` must start with the calling kit's registered origin
  (`kit_api_keys.return_origin`), so the page cannot be used as an open
  redirect.
- Rate limits on the page's actions, keyed by token and IP.

qkit PR:

- `/order/{boothId}/pay` redirects to `pay_url`. On return it already sends a
  numbered order to its status page; it also calls `finalizePaidOrder` in case
  the P2 callback has not arrived yet.
- Deleted: `pay-form.tsx`, `qr-image.ts`, the file handling in `claimPayment`,
  `paymentProofSchema`.
- `walkup-pay-step.tsx` is unchanged and is now the only renderer.

Migration: paykit only (token hash, return URL and title on `transactions`;
`return_origin` on `kit_api_keys`). qkit none.

Verified by: paykit DOM and route tests, a Playwright smoke for the public
page. qkit e2e `customer-order.spec.ts` rewritten around the redirect with the
mock serving a stub pay page. Manual on a preview, phone-sized, with
TEST · PayNow, including closing the tab on the pay page and confirming the
order still gets its number through the callback.

### P6. Bank auto detect, in paykit only

Not designed here. It gets its own spec in the paykit repo. This document
fixes where it goes and what it may rely on, so qkit needs no change when it
ships.

- It is built behind paykit's `PaymentProvider` seam or beside it, never in
  qkit.
- What it finds is written to `paykit.payment_evidence` (P3) under its own
  `kind`.
- When it is sure, paykit moves the transaction to `confirmed` itself and
  fires the P2 callback. qkit's handler already numbers, notifies and mirrors.
  The vendor's "Confirm payment received" button stays as the manual path.
- Prerequisites: the owner amends paykit's no-auto-verify rule; checkouts
  carry an `expires_at` that qkit sets to its 30 minute window, so paykit
  never matches a payment to an order qkit has abandoned (Problem 3); a
  payment that matches nothing is recorded for the vendor to see, not dropped.
- Open question for that spec, not answered here: what the signal is. Earlier
  paykit specs name a bank business API and a gateway with webhooks, and note
  that no bank partnership exists. None of these has been checked for
  feasibility.

### R1. Printing goes thin

printkit PR:

- `GET /api/v1/print-locations/status` adds `manage_url`: the right printkit
  page for this location, whether that is "add a printer" or "manage this
  one". qkit stops building printkit paths.
- The printer advice (which printers work with only an iPad, why Bluetooth
  needs a phone or a Raspberry Pi) is shown on that printkit page.
- The status callback body gains `source_ref` beside `order_id`. Additive;
  `order_id` is removed in a later printkit release once qkit reads the new
  name.

qkit PR:

- `printing-section.tsx`: switch, status badge, one link to `manage_url`. The
  advice paragraph and both hardcoded routes are deleted. The "Printer
  offline" confirmation stays, since it guards qkit's own switch.
- `print-status` route accepts `source_ref` or `order_id`.
- `saveBooth` stops writing `printkit_location_id` and the booth page stops
  reading it.

Migration: none in either repo. `booths.printkit_location_id` stays as an
unused column.

Verified by: printkit route tests; qkit DOM tests for the four status views
and route tests for both field names. Manual: open the edit page of
TEST · Printing and check the badge and link. **No QR order is placed on
TEST · Printing**, because that sends a real print job; an end-to-end print is
the owner's to run.

## Migrations at a glance

| Phase | qkit | paykit                                                                           | printkit |
| ----- | ---- | -------------------------------------------------------------------------------- | -------- |
| P1    | none | none                                                                             |          |
| P2    | none | `kit_api_keys.callback_url`, `callback_secret`                                   |          |
| P3    | none | bucket `paykit-payment-proofs` and its policy; table `payment_evidence` with RLS |          |
| P4    | none | none                                                                             |          |
| P5    | none | `transactions`: token hash, return URL, title; `kit_api_keys.return_origin`      |          |
| P6    | none | set by its own spec; at least `transactions.expires_at`                          |          |
| R1    | none |                                                                                  | none     |

qkit needs no migration in any phase. The full SQL for each paykit migration is
given to the owner in chat with that phase's PR, to apply by hand.

Columns left in place in qkit and no longer written: `orders.payment_proof_path`,
`orders.payment_proof_hash`, `booths.printkit_location_id`. Dropping them is a
separate, optional cleanup.

## Suggested order

P1, R1 (independent, small, can run in parallel), P2, P3, P4, P5, then P6 as
its own project. P1 and R1 need no decision and no migration.

## Out of scope

- Any change to `qkit.place_order` or `qkit.place_walkup_order`.
- Telegram alerts.
- Refunds, bookings, paykit's plan and pricing.
- A shared payment or print component in `@merqo/ui`. printkit's rules forbid
  a shared print library, and a hosted page or an API keeps each kit's logic
  in one repo.
- Moving `orders.payment_status` out of qkit. The board, the cancel rule and
  the sweep read it in SQL and in realtime.

## Working rules for every phase

Feature branch per repo, never `main`. No hook bypass. `pnpm check && pnpm test`
before a phase is called done, in each repo it touches. RLS stays the
authorization boundary; the service-role client stays server-only; every new
route and action validates with Zod; no secret under `NEXT_PUBLIC_*`. Env files
and `secrets/` are never read or written. `AGENTS.md` updates that a phase
makes necessary are proposed to the owner, not written directly.
