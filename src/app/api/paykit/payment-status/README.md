# payment-status

## Purpose

Inbound callback paykit fires after a claim, unclaim or confirm commits, so an
order learns about a payment change that qkit did not cause itself. It is the
seam the later separation phases rely on: a customer who pays on a page hosted
by paykit, and a payment paykit confirms by itself.

## Contents

- `route.ts` — `POST(request)`. Guarded by `paykitCallbackBearerOk()`
  (constant-time check of `PAYKIT_CALLBACK_SECRET`) and a rate limit of 120 a
  minute per address. Reads **only** `order_ref` (a qkit order id) from the
  body; `transaction_id` and `status` are sent and ignored. It then asks paykit
  for the order's transaction (`getCheckoutByOrderRef`), refuses one whose
  vendor differs from the order's booth's vendor or whose amount differs from
  the order's total, and applies the status paykit answered with:
  - `claimed` or `confirmed` on an order with no number: `finalizePaidOrder`
    (number, vendor alert, print job, mirror).
  - `claimed` or `confirmed` on a numbered order: `writePaidMirror` only.
    `confirmed` sets `paid_at`.
  - `pending`: a `claimed` mirror goes back to `pending`.
  - A cancelled order, and an order that never took payment, are left alone
    and logged.
- `route.test.ts` — the gate (401, 429, 400, 404, 503), the read-back
  (paykit unreachable, no transaction, vendor mismatch, amount mismatch, a
  forged or stale body), each rule above, and a repeated callback.

## Connectivity

One caller: paykit's `src/lib/kit-callback.ts`, which posts to the
`callback_url` stored on qkit's `paykit.kit_api_keys` row.

Answers: 200 `{ok:true}`; 200 `{ok:true, ignored}` for an order left alone;
400; 401; 404 unknown order; 409 when paykit's transaction is missing or does
not match the order; 429; 503 when the database or paykit could not be
reached. On 409 and 503 nothing is changed.

Because the status is read back, a replayed, reordered or forged body cannot
set a status paykit does not hold, and no timestamp is needed to order events.
paykit does not retry: a callback lost to a 503 is repaired by the next
callback, by the action that caused the change, or by the vendor's confirm
button.

This route never creates a checkout. It calls `getCheckoutByOrderRef`
directly, not `transactionIdForOrder`, which would create one.

## Parent

[paykit](../README.md)
