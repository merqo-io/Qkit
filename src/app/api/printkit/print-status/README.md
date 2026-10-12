# print-status

## Purpose

Inbound callback printkit fires when a print job finishes, so a
vendor's dashboard board can surface a "Print failed" badge without qkit
having to poll printkit.

## Contents

- `route.ts` — `POST(request)`. Guarded by `printkitCallbackBearerOk()`
  (shared-secret `Authorization: Bearer` check against
  `PRINTKIT_CALLBACK_SECRET`, constant-time compare via `timingSafeEqual`,
  imported from `@/lib/qkit-printkit-auth`). Validates the body
  (`source_ref` or `order_id`, `status: "printed"|"failed"`, `attempt_at`)
  with a local Zod schema. The order is named by `source_ref`, or by
  `order_id` from a printkit release that predates it; one is required, and
  a body where the two differ is a 400. It then updates `orders.print_status`/
  `print_status_updated_at` via `createServiceClient()`, keyed on `id`.
  Returns 401 on a bad/missing bearer, 429 when rate limited, 400 on an
  unparseable body, 404 when no order has that id, 503 on a DB failure,
  200 (`{ok:true}`, or `{ok:true, stale:true}` for an older attempt) otherwise.
- `route.test.ts` — tests the 401/400/200/503 branches and both names for the order against a mocked
  `printkitCallbackBearerOk`/Supabase client.

## Connectivity

This endpoint has exactly one caller: printkit's own print-job worker, as a
job finishes — see printkit's own repo for the caller side. Feeds
`orders.print_status`, read
by `@/components/board/order-card.tsx`'s `PrintBadge` (renders only on `"failed"`;
`"queued"`/`"sent"`/`"printed"`/`"not_required"` are silent, v0.1 scope).

Callbacks carry their accepted delivery attempt's timestamp. Atomic filters
prevent older attempts from overwriting newer outcomes, including late failed
callbacks after a successful reprint.

## Parent

[printkit](../README.md)

Callbacks require a canonical UTC attempt_at timestamp with exactly six fractional digits. Printkit derives it from the accepted row's sent_at, then requeued_at, then created_at, preserving database microseconds. The order's print_status_updated_at stores this accepted attempt identity, rather than callback receipt time. Older attempts and duplicates acknowledge successfully without changing terminal state; a failure cannot replace printed within the same attempt. A newer reprint may replace the previous attempt's result.

Deploy Printkit's sender first, then qkit's receiver: the former adds a field that the old receiver ignores. The updated receiver rejects missing timestamps because legacy callbacks cannot safely identify their attempt. No schema change is required. The initial queued write remains conditioned on not_required, preserving a callback that arrives before job creation returns.
