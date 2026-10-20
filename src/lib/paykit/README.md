# paykit

## Purpose

Server-only HTTP client for paykit's `/api/v1/*` checkout API — the Merqo
family's shared vendor payment engine (a separate sibling kit; see
`../../../../paykit/AGENTS.md`). qkit no longer renders its own PayNow QR or
tracks payment state locally end-to-end; this is the seam that replaced
`lib/payments/` (deleted in the paykit cutover).

## Contents

- `client.ts` — calls paykit at `NEXT_PUBLIC_PAYKIT_URL` (falls back to
  `https://paykit.merqo.io` when unset). `getVendorConfig(vendorId)` (reads the vendor's payment
  config as paykit holds it; qkit never writes it, the vendor enters it in
  paykit's own dashboard. `ok:false` means paykit did not say, which is not
  the same as nothing on file), `createCheckout({vendorId,
amountCents, orderRef, expiresAt, returnUrl?, title?})` (idempotent on `orderRef` — safe to call again for
  the same order and get back the same transaction; `expiresAt` is sent as
  `expires_at`, the time qkit gives up on the order (`paymentDeadline` in
  `@/lib/orders`, `created_at` + 30 minutes), required so no caller leaves it
  out, and paykit keeps the first value it stored on a replay; with `returnUrl` the
  answer carries `payUrl`, paykit's hosted pay page, and each such call
  retires the previous pay link; `status` is where the payment stands in
  paykit),
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
- `payment-setup.ts` — `vendorPaymentSetup(vendorId)`: what the vendor has
  on file in paykit, as one of five states the booth form can show:
  `unreachable`, `none`, `paynow`, `link` or `image`, the last three with the
  vendor's own name for it (payee name or label). No UEN, mobile number, link
  or image address is carried, so none reaches the browser. `setupKind(setup)`
  is the kind a booth's `{kind}` marker takes from it (`paynow`, `pointer` or
  null). Vendor-wide, not per booth.
- `payment-setup.test.ts` — each state, the three causes of `none`, that no
  identifier is carried, and `setupKind`.
- `transaction-for-order.ts` — `transactionIdForOrder({vendorId, amountCents,
orderRef, expiresAt})`: the paykit transaction id for an order. qkit stores none, so
  every action that claims, undoes or confirms a payment gets it here. It
  looks the transaction up and creates a checkout only when paykit has none
  (404) or has no lookup route (405). Creating re-renders from the vendor's
  current payment config and is refused once that config changed, so calling
  create first left an order already awaiting payment impossible to settle.
  A found transaction is refused when its vendor or its amount differs from
  the order's. `expiresAt` is passed to `createCheckout` and used only when
  it creates.
- `transaction-for-order.test.ts` — found, vendor mismatch, amount mismatch, the two fallback
  statuses, a failed fallback, and that any other lookup failure creates
  nothing.
- `client.test.ts` — tests the missing-secret degrade path (no network call),
  the bearer header/URL shape, response mapping for each endpoint, non-2xx
  error-body surfacing, network-failure handling (never throws), and that
  every path-interpolated id is percent-encoded.

## Connectivity

Called from: `src/app/dashboard/booths/actions.ts` (`saveBooth`, via
`vendorPaymentSetup`, for the kind the booth's marker should carry),
`src/app/dashboard/booths/[boothId]/page.tsx` and `new/page.tsx` (via
`vendorPaymentSetup`, for the Payment section's summary; the edit page also
calls `getBookingStatus`,
prefilling `BookingStatusSection`), `src/app/order/[boothId]/
[orderNumber]/page.tsx` and `payment-actions.ts`
(`createCheckout` on the pay page; `transactionIdForOrder` then `unclaimCheckout` in the actions, customer side), and
`src/app/dashboard/order-actions.ts` (`confirmOrderPayment` and `confirmPaymentAndStart`, through `transactionIdForOrder`, vendor side).
`PAYKIT_KIT_SECRET` / `NEXT_PUBLIC_PAYKIT_URL` are the two env vars this
module reads — see `.env.example` for what they must equal on paykit's side.

## Parent

[lib](../README.md)

## Payment screenshots

The customer's screenshot and "I've paid" tap happen on paykit's hosted pay page, not through this client: there is no `claimCheckout`. `createCheckout` with `returnUrl` is how a customer reaches it; paykit checks `returnUrl` against the origin registered for qkit (`kit_api_keys.return_origin`) and answers 400 when it is not on it.

`getCheckoutEvidence(id)` reads `GET /api/v1/checkout/{id}/evidence`: `proofUrl` (signed by paykit, valid 300 seconds), `duplicateOf` (`{ orderRef, kitSlug }` of another transaction of the same vendor carrying the same file) and `amountMatch` (`null` when paykit did not check). paykit trusts the calling kit, so the caller must first establish that the signed-in vendor owns the order; `getOrderPaymentProof` in `src/app/dashboard/payment-evidence-actions.ts` is the only caller.
