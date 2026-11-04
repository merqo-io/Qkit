# event-pass-usage

## Purpose

Endpoint reporting how many cups a vendor sold inside a time window, so the Merqo product can settle an Event Pass top-up (`clamp(cups x 15c, 1400, 2800) - 1400`) without querying the qkit schema directly.

## Contents

- `route.ts`, `GET(request)`. Guarded by `bearerOk()` (`MERQO_METRICS_SECRET`, from `@/lib/merqo/auth`), then rate limited per client IP (`merqo-event-pass-usage:<ip>`, 30 per 60s). Query: `vendor_id` (UUID), `starts_at` and `ends_at` (ISO 8601 datetimes with a UTC offset, `starts_at` strictly before `ends_at`), validated with Zod; a bad query is a generic 400. Calls the `vendor_cups_between` RPC through `createServiceClient()` and returns `{ vendor_id, starts_at, ends_at, cups }`. An RPC error is a generic 500 and the detail is only logged.

## Cup definition

`qkit.vendor_cups_between(p_vendor_id, p_from, p_to)` (migration `0117_vendor_cups_between.sql`, `service_role` only) sums item `quantity` across all of the vendor's booths for orders with `created_at >= p_from` and `< p_to`. Cancelled orders and orders whose `payment_status` is still `pending` are excluded: an unpaid cart is not a sale. pgTAP coverage lives in `supabase/tests/event-pass-usage.test.sql`.

## Connectivity

Calls `createServiceClient()` (service-role, bypasses RLS) and the `vendor_cups_between` function typed in `@/lib/types`. Shares `bearerOk()` with the other read-only Merqo routes.

## Parent

[merqo](../README.md)
