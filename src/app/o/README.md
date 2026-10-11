# o

## Purpose

Short-code customer ordering entry point — the current, preferred route for
QR-linked booth ordering (a short per-booth code rather than the raw booth
UUID). See `order/` for the legacy booth-id route, which now redirects here.

## Contents

- `[code]/` — dynamic segment holding the menu/cart page, `placeOrder`
  server action, and loading skeleton for a given booth short code. See its
  own README for the file-level breakdown.
- `layout.tsx` — wraps the segment in `<main>`, the page's main landmark.
  These pages have no shared chrome, so that is all it does.

## Connectivity

A booth's printed/scanned QR code points at `/o/<short_code>`, resolved by
`[code]/page.tsx` via the `get_booth_for_order` RPC. `[code]/actions.ts`
(`placeOrder`) is called from `src/components/order/order-form.tsx` and, on
success, navigates the customer to `/order/[boothId]/[orderNumber]` for
live status tracking.

## Parent

[app](../README.md)
