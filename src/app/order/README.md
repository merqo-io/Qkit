# order

## Purpose

Legacy/direct booth-id customer ordering route, kept alive for old printed QR
codes and any link built from a raw booth id rather than the current short
code. Also hosts the (route-independent) live order-status page.

## Contents

- `[boothId]/` — resolves a booth id to its short code and redirects into
  `/o/[code]`; also contains `[orderNumber]/`, the live order-status/tracking
  page reached after any order is placed (see its own README).
- `layout.tsx` — wraps the segment in `<main>`, the page's main landmark.

## Connectivity

`[boothId]/page.tsx` is a compatibility shim: the reorder button, the
"Order again" link on the status page, and any shared `/order/{boothId}` URL
only know the booth id, so this route looks up the booth's `short_code` and
redirects to `/o/{short_code}` (preserving the sessionStorage reorder handoff
read by `OrderForm`). `[boothId]/[orderNumber]/` is unaffected by which entry
route the customer used — it's linked to directly from `placeOrder`'s result.

## Parent

[app](../README.md)
