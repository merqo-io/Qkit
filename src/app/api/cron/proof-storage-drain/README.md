# proof-storage-drain

## Purpose

Daily Vercel Cron sweep of `qkit.proof_storage_deletions`, the queue of payment-screenshot Storage objects whose orders were deleted (migration 0119). Only `deleteBooth` drained the queue inline; rows queued by account or vendor cascades and manual deletes were never removed until this route.

## Contents

- `route.ts` — `GET(request)`. Requires `Authorization: Bearer $CRON_SECRET` (constant-time compare, fails closed with 401 when `CRON_SECRET` is unset) and then calls `drainProofDeletions()` once. 200 `{ok:true}`; 401; 500 `{error}` if the drain throws. The drain logs its own failures and leaves rows queued, so 200 means the sweep ran, not that the queue is empty.
- `route.test.ts` — missing header, wrong secret, no Bearer prefix, unset secret, success, and a rejecting drain.

## Limits

Each run drains at most 100 rows, so a larger backlog clears over several days. A row that fails 5 times stays queued for manual inspection and is no longer retried.

## Connectivity

Scheduled in `vercel.json` (`52 3 * * *` UTC). Vercel fires crons on Production only, so on staging call the route by hand with the bearer, for example `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging host>/api/cron/proof-storage-drain`. Set `CRON_SECRET` in Vercel env; Vercel then sends it automatically. `/api/cron` is outside the session-protected paths in `src/lib/supabase/middleware.ts`, so no proxy change is needed.

## Parent

[cron](../README.md)
