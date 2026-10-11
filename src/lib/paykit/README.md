# paykit

## Purpose

Server-only HTTP client for paykit's `/api/v1/*` checkout API — the Merqo
family's shared vendor payment engine (a separate sibling kit; see
`../../../../paykit/AGENTS.md`). qkit no longer renders its own PayNow QR or
tracks payment state locally end-to-end; this is the seam that replaced
`lib/payments/` (deleted in the paykit cutover).

## Contents

- `client.ts` — `upsertVendorConfig(vendorId, config)` (the "quick add
  PayNow" write path — booth-form's payment section calls this instead of
  writing the full config to `booths.payment`), `getVendorConfig(vendorId)`
  (the read-back path — returns the full `paynow`/`pointer` fields, the
  prefill source for `dashboard/booths/[boothId]/page.tsx` re-opening an
  existing booth's Payment section), `createCheckout({vendorId,
amountCents, orderRef})` (idempotent on `orderRef` — safe to call again for
  the same order and get back the same transaction), `claimCheckout(id)` (customer "I've paid"),
  `unclaimCheckout(id)` (customer "Tapped by mistake? Undo" — reverts `claimed` back to `pending`;
  idempotent on `pending`, and paykit itself refuses to revert a `confirmed`
  transaction, echoing that status back unchanged), `confirmCheckout(id)`
  (vendor "Confirm payment"), `getCheckoutStatus(id)` (read-only poll,
  not currently used by qkit's own polling — see its doc comment),
  `getCheckoutByOrderRef(orderRef)` (finds the transaction paykit already
  holds for an order, without creating one, and the vendor that owns it; a 404 means paykit has none),
  and `getBookingStatus(bookingId)` (read-only booking status — deposit/balance
  amounts, event date, and whether each is confirmed — for the "booking
  status" section on an event-mode booth's dashboard; the vendor pastes
  their own `paykit_booking_id` into the booth, this never looks a booking
  up by name/phone/date). Every
  function returns a `PaykitResult<T>` (`{ok:true,data}` |
  `{ok:false,status,error}`) and never throws; the shared `paykitRequest`
  helper reads `PAYKIT_KIT_SECRET` at request time (not import time; see the blank `.env.example` configuration template) and
  bearer-authenticates as `Authorization: Bearer qkit:<secret>`, validating
  every response body against a local Zod schema mirroring paykit's own
  `src/lib/api-schemas.ts` wire contract. Every `vendorId`/`transactionId`
  interpolated into a request path is `encodeURIComponent`'d, so a value
  containing `/`, `?`, or `#` can't add extra path segments or query params
  to the request paykit actually receives.
- `saved-vendor-payment.ts` — `savedVendorPayment(vendorId)`: the vendor's
  payment details from `getVendorConfig`, mapped to qkit's `PaymentConfig`
  (`paynow` with whichever of UEN/mobile is set, or `pointer` with its link
  or QR image), or `null` when nothing is saved or paykit cannot be reached.
  Vendor-wide, not per booth: both booth pages pass it to the Payment section
  so that picking a method already set up starts from these details.
- `saved-vendor-payment.test.ts` — each mapping above, plus the three `null`
  cases (nothing saved, a config of no known kind, paykit unreachable).
- `transaction-for-order.ts` — `transactionIdForOrder({vendorId, amountCents,
orderRef})`: the paykit transaction id for an order. qkit stores none, so
  every action that claims, undoes or confirms a payment gets it here. It
  looks the transaction up and creates a checkout only when paykit has none
  (404) or has no lookup route (405). Creating re-renders from the vendor's
  current payment config and is refused once that config changed, so calling
  create first left an order already awaiting payment impossible to settle.
  A found transaction is refused when its vendor or its amount differs from
  the order's.
- `transaction-for-order.test.ts` — found, vendor mismatch, amount mismatch, the two fallback
  statuses, a failed fallback, and that any other lookup failure creates
  nothing.
- `client.test.ts` — tests the missing-secret degrade path (no network call),
  the bearer header/URL shape, response mapping for each endpoint, non-2xx
  error-body surfacing, network-failure handling (never throws), and that
  every path-interpolated id is percent-encoded.

## Connectivity

Called from: `src/app/dashboard/booths/actions.ts` (`saveBooth`, via
`upsertVendorConfig`), `src/app/dashboard/booths/[boothId]/page.tsx` (via
`getVendorConfig`, prefilling the edit form, and `getBookingStatus`,
prefilling `BookingStatusSection`), `src/app/order/[boothId]/
[orderNumber]/page.tsx` and `payment-actions.ts`
(`createCheckout` on the pay page; `transactionIdForOrder` then `claimCheckout`/`unclaimCheckout` in the actions, customer side), and
`src/app/dashboard/order-actions.ts` (`confirmOrderPayment` and `confirmPaymentAndStart`, through `transactionIdForOrder`, vendor side).
`PAYKIT_KIT_SECRET` / `NEXT_PUBLIC_PAYKIT_URL` are the two env vars this
module reads — see `.env.example` for what they must equal on paykit's side.

## Parent

[lib](../README.md)
