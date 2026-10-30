# payment-status

Printing policy (2026-10-27): placement and payment claims never queue labels. Confirmed payments queue after the local payment mirror is written; non-payment orders queue after vendor Start. The helper rechecks current status and printing opt-in. Migration `0107` makes new printing-enabled non-payment orders wait for Start, including walk-ups. Customer arrival records `confirmed` fulfillment on these booths so Start stays available. Printkit deduplicates by order UUID. See `docs/meta/2026-10-27-printing-stage-gate.md`.

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
    (number, vendor alert, mirror, then print only when confirmed).
  - `claimed` or `confirmed` on a numbered order: `writePaidMirror`.
    `confirmed` sets `paid_at` and queues an eligible label.
  - `pending`: a `claimed` mirror goes back to `pending`.
  - A cancelled order, and an order that never took payment, are left alone
    and logged.
  - Rejections are recorded as `webhook_rejected` in `ops_events` (ref = order
    id): `transaction_missing` (paykit holds no payment) and
    `transaction_mismatch` (vendor or amount differs), both against the booth's
    vendor. A wrong secret records `signature_invalid` only when the unverified
    body names a real qkit order; the vendor is read from qkit's own tables,
    never the body, behind a separate 20 a minute limiter. A body without a
    valid `order_ref` (the only schema failure) has no vendor and records
    nothing.
- `route.test.ts` — the gate (401, 429, 400, 404, 503), the read-back
  (paykit unreachable, no transaction, vendor mismatch, amount mismatch, a
  forged or stale body), each rule above, a repeated callback, and each
  `webhook_rejected` record.

## Connectivity

One caller: paykit's `src/lib/kit-callback.ts`, which posts to the
`callback_url` stored on qkit's `paykit.kit_api_keys` row.

Answers: 200 `{ok:true}`; 200 `{ok:true, ignored}` for an order left alone;
400; 401; 404 unknown order; 409 when paykit's transaction is missing or does
not match the order; 429; 503 when the database or paykit could not be
reached. On 409 and 503 nothing is changed.

Because the status is read back, a replayed, reordered or forged body cannot
set a status paykit does not hold, and no timestamp is needed to order events.
paykit does not retry. A lost callback costs nothing when a qkit action caused
the change, because that action writes the same status itself. Two things only
the callback does are not repaired if it is lost: filling `paid_at` after
"confirm and start", and finalizing an order whose payment changed outside
qkit.

The read from paykit and the write to the order are not one step. A status that
changes in paykit in between (a customer who undoes and claims again within the
few seconds a slow lookup takes) can leave the mirror one step stale until the
next callback or action. The mirror is never moved past what paykit held at the
time of the read.

This route never creates a checkout. It calls `getCheckoutByOrderRef`
directly, not `transactionIdForOrder`, which would create one.

## Parent

[paykit](../README.md)

The body is parsed by `readBody`, which returns the validated body or the error response.
