# printkit

## Purpose

Server-only HTTP client for printkit's `/api/v1/print-jobs` (job creation),
`/api/v1/print-locations` (location registration) and
`/api/v1/print-locations/status` (is this booth's printer reachable) APIs — a separate
sibling kit that bridges an order to a vendor's physical kitchen/receipt
printer. Print-job status changes still flow the other direction (printkit calls
qkit's own `/api/printkit/print-status` route, not covered by this module).

## Contents

- `client.ts` — `createPrintJob({vendorId, orderId, boothId, customerName,
orderNumber})`: fires a job-creation request and returns a
  `PrintkitResult<{id}>` (`{ok:true,data}` | `{ok:false,status,error}`),
  never throwing. `registerPrintLocation({vendorId, sourceRef, label,
  active})`: registers/updates a booth as a printkit "print location" —
  `active` mirrors the booth's own `print_enabled`, and printkit uses a
  vendor's active-location count to decide auto-delivery (exactly one active
  location auto-delivers; 2+ stays queued for manual assignment), so a booth
  that's deleted or has printing turned off must be re-registered with
  `active: false`, never just left alone. Both functions read
  `PRINTKIT_KIT_SECRET` and `NEXT_PUBLIC_PRINTKIT_URL` at request time (not
  import time). Unlike `../paykit/client.ts`, an unset
  `NEXT_PUBLIC_PRINTKIT_URL` has **no fallback host** — it degrades to the
  same "not configured yet" result as a missing secret rather than guessing a
  `*.vercel.app` subdomain, because guessing could send the bearer secret to an unclaimed or incorrect host.
  Bearer-authenticates as `Authorization: Bearer qkit:<secret>`, validating
  the response body against a local Zod schema.
- `client.test.ts` — tests, for `createPrintJob` and `registerPrintLocation`, the missing-secret degrade
  path, the missing-URL fail-closed path (both never call `fetch`), the
  bearer header/payload shape, non-2xx error-body surfacing, network-failure
  handling, and an invalid-JSON response body (both collapse to `ok:false`
  without throwing). These mocked failures do not establish current deployment availability.

`getPrinterStatus(boothId)` is the newest of the three: printkit owns
whether a booth's printer is set up and reachable, for every kind of printer
it supports, so qkit asks over HTTP instead of subscribing to printkit's own
realtime channel with qkit's Supabase client. That subscription used to work
only because the two kits share a Supabase project, and only for a Bluetooth
bridge; a cloud printer has no bridge to publish presence at all.
Its answer also carries `manage_url`, the printkit page for this booth's
printer. The client keeps it only when it is an http(s) URL and reads
anything else, including no field at all, as null: the link is optional and
a bad one must never cost the vendor the status. `client.test.ts` covers
each of those cases. `printkitConfigured()` says whether qkit holds both the
printkit address and its secret, so a caller can tell "not set up in this
deployment" from "printkit did not answer".

## Connectivity

`createPrintJob` is called from `src/app/o/[code]/notify.ts`
(`notifyPrintkit`, fired best-effort from `placeOrder` after a successful
order, gated on the booth's `print_enabled` — looks up the order's real `id`
itself, since `place_order`'s RPC output carries none, and marks
`orders.print_status = 'queued'` on a successful job creation).
`registerPrintLocation` is called from `src/app/dashboard/booths/actions.ts`
(`syncPrintLocation`, best-effort from both `saveBooth`, matching
`print_enabled`, and `deleteBooth`, always `active: false`).
`PRINTKIT_KIT_SECRET` / `NEXT_PUBLIC_PRINTKIT_URL` are the two env vars this
module reads. No browser code reads `NEXT_PUBLIC_PRINTKIT_URL`: the Printing section's
link comes from printkit's `manage_url`, not from a path built here.
`registerPrintLocation`'s returned id is not stored; printkit keys a
location on the booth id.

## Parent

[lib](../README.md)

`labels.ts` validates the persisted order snapshot and expands one label per item unit, bounded at 100 total. `createPrintJob` can send the new `label_batch` contract; old calls without labels retain the legacy single-label body. See the multi-drink specification for the item-classification default, Printkit migration dependency and physical acceptance steps.
