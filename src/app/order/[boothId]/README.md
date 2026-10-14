# [boothId]

## Purpose

Legacy booth-id entry point; redirects to the current short-code route
(`o/[code]/`) to keep old/printed QR links and the reorder handoff working.

## Contents

- `page.tsx` — `OrderBoothRedirect` (route entry): validates `boothId` as a
  UUID (`notFound()` otherwise), looks up the booth's `short_code` via the
  **service client** (the customer is anonymous and anon cannot read
  `booths` directly), then `redirect("/o/" + short_code)`. `notFound()` if
  the booth has no short code.
- `[orderNumber]/` — the live customer order-status page, reached after an
  order is placed (independent of which entry route — `/order/{boothId}` or
  `/o/{code}` — the customer used). See its own README.
- `display/` — the public TV/second-screen queue display for one booth,
  reached from the dashboard's booth list, not from a customer's own order
  flow. See its own README.
- `pickup/` — the public, unattended self-checkout pickup kiosk (a paired
  Bluetooth HID scanner reads the customer's own order-status QR to
  complete their order), reached only by whoever sets up the kiosk tablet,
  not linked to from anywhere else in the app. See its own README.
- `pay/` — the pay step for a payment-required order that has no number
  yet: it sends the customer to paykit's hosted pay page and, when they come
  back, numbers the order. See its own README.

## Connectivity

Three callers only know a booth id rather than its short code: the
`ReorderButton` (`@/components/order/reorder-button.tsx`), the order-status page's
"Order again" link, and any legacy/printed `/order/{boothId}` URL. `page.tsx`
resolves the short code and redirects to `/o/{short_code}`, where `OrderForm`
picks up the reorder handoff stashed in sessionStorage. `[orderNumber]/` is
linked to directly by `placeOrder`'s result regardless of entry route, unless
`placeOrder` returns a null `orderNumber` (a payment-required order deferred
until claim), in which case `OrderForm` redirects to `pay/` instead.
`display/` is linked to from `src/app/dashboard/booths/booth-list.tsx`'s
"Open the customer queue display" button, not from anything in the customer order flow.
`pickup/` is set up once per booth at the physical pickup shelf, out of
band, and calls into `[orderNumber]/collect-actions.ts`. `pay/` redirects to
paykit's pay page, and on the customer's return to `[orderNumber]/` once the
order has its number.

## Parent

[order](../README.md)
