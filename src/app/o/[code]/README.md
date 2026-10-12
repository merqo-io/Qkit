# [code]

## Purpose

Customer menu + cart + checkout for a booth, keyed by its short QR code —
the current (non-legacy) customer ordering entry point.

## Contents

- `actions.ts` — `placeOrder(code, input, idempotencyKey, holdSession?)`
  (the optional last argument is the basket's hold session; a placed order
  releases that hold, best-effort) server action:
  validates `code`/`idempotencyKey`/`input` (`placeOrderSchema`), applies a
  best-effort per-IP flood guard (`rateLimit`, 8/60s, fails open), normalizes
  a blank/whitespace-only `customerPhone` to `undefined` (so "left blank" and
  "never typed" are indistinguishable to the RPC), then calls the
  `place_order` RPC with `p_customer_phone`. Maps known Postgres `RAISE`
  prefixes (`ORDER_EXPIRED`/`ORDER_UNSERVABLE`/`ORDER_SOLD_OUT`/
  `ORDER_ITEM_UNAVAILABLE`/`ORDER_RATE_LIMITED`) to customer-facing messages
  via `messageFor()`, logs only the genuinely-unexpected failures, and on
  success fires the `order_placed` analytics event, then fires
  `notifyVendorTelegram`/`notifyPrintkit` (from `./notify.ts`, see below) and
  returns `{ orderNumber, boothId, accessToken }`.
- `notify.ts` — **not** a `"use server"` file, deliberately: every export of
  a `"use server"` file becomes its own independently client-callable Server
  Action regardless of who imports it, and these two are only ever meant to
  be called from `placeOrder` here and `finalizePaidOrder`
  (`order/[boothId]/[orderNumber]/finalize-paid-order.ts`) — never a client
  component. Keeping them in a plain module closes that unintended public
  endpoint (a client that knew a real `boothId`/`orderNumber` could otherwise
  invoke either directly, bypassing `placeOrder`'s own validation and rate
  limit entirely).
- `notify.test.ts` — `notifyPrintkit` run again for one order: printkit's 409
  ("a job already exists") is not logged as a failure and the guarded
  `print_status` write is still made; any other failure logs and writes
  nothing.
  `notifyVendorTelegram(boothId, orderNumber)` (a redundant vendor alert via
  merqo's shared Telegram bot) is entirely best-effort and wrapped in its own
  try/catch: it resolves the booth's `vendor_id`, looks up the order's
  `total_cents` for the message text (both via the service-role client — no
  vendor session exists in this customer-facing action), names the order by
  `vendorFacingOrderNumber` from `@/lib/daily-order-number` (the day's ticket number when the vendor has
  daily reset on, so the alert reads "#002" like the ticket and not the
  permanent "#0847"; the same helper `notifyPrintkit` labels with), then calls
  `@/lib/merqo/customer-notify`'s `notifyVendor(vendorId, message)` — a
  merqo outage or a vendor who never connected can never affect
  `placeOrder`'s own returned result. See
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`
  (Phase A2 — supersedes qkit's own retired bot, formerly
  `docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md`).
  `notifyPrintkit(boothId, orderNumber)` fires on success — same
  best-effort, wrapped-in-its-own-try/catch contract. It looks up the
  booth's `vendor_id` and `print_enabled`, returning silently (no log) when
  printing isn't enabled for that booth — before doing the order lookup, so
  a disabled booth never pays for it. Otherwise it resolves the order's
  real `id` and its own stored `customer_name` (the `place_order` RPC output
  carries neither, only `order_number`/`booth_id`/`access_token` — migration
  `0075`; printing the order's own stored name, not a caller-supplied one,
  is what closes the same public-endpoint gap above from the print side),
  calls `@/lib/printkit/client`'s `createPrintJob` — with the label's own
  `orderNumber` rebased through `displayOrderNumber` (`@/lib/orders`) using
  the vendor's `board_settings.daily_order_number_reset` and the booth's
  first order of the SGT day as baseline, same as the board/TV/customer
  status page, when that setting is on (2026-09-15 fix: it used to print the
  raw permanent number regardless, so a printed ticket's last digit could
  disagree with what everyone actually sees on screen — undermining a
  physical pickup-shelf-slot workflow keyed on that digit) — logging on a
  non-ok result, and on a successful job creation marks
  `orders.print_status = 'queued'` (migration `0081`) — conditioned on
  `print_status = 'not_required'` so a terminal status from printkit's own
  callback route landing first can never be overwritten back to `'queued'`
  — so the column doesn't lie about a job that's genuinely in progress for
  the whole window before that callback lands. Logs (doesn't discard) an
  update failure too. Both functions are `export`ed so
  `order/[boothId]/[orderNumber]/payment-actions.ts`'s `claimPayment` can
  fire the same two calls at claim time for a payment-required order
  (numbering + vendor notification are deferred to a successful claim
  there, not `placeOrder` time) without duplicating either function's logic.
- `actions.place-order.test.ts` — unit tests (RPC mocked) covering: the
  expired-code message mapping, a successful order, the action-level flood
  guard rejecting before `place_order` is ever called, fail-open behaviour
  when the limiter RPC itself errors, every known raise→message mapping via
  `it.each`, a malformed-RPC-output guard, rejection of a non-UUID
  idempotency key before any RPC call, a supplied `customerPhone` reaching
  `place_order` as `p_customer_phone`, and an omitted/blank/whitespace-only
  one instead sending `p_customer_phone: undefined` (cross-kit customer
  identity, migration `0075` — the "genuinely optional" contract at the
  action layer), a "vendor alert" block proving the redundant-channel
  contract explicitly (not just claiming it): calls `notifyVendor` with the
  booth's `vendor_id` and a message containing the order number/total,
  skips silently when the booth can't be resolved, and a `notifyVendor`
  rejection doesn't change `placeOrder`'s own returned result; and a
  "printkit notify" block with the same shape: `createPrintJob` called with
  the booth's `vendor_id`, the order's real `id`, `boothId`, and the order
  number/customer name, `orders.print_status` set to `'queued'` only on a
  successful job creation (not touched on failure), skipped silently when
  the order id can't be resolved, a `createPrintJob` rejection never
  changing `placeOrder`'s own returned result, and — the `print_enabled`
  gate — `createPrintJob` never called (and the order lookup itself
  skipped) when the booth's `print_enabled` is false.
- `page.tsx` — `OrderEntryPage` (route entry, `revalidate=0`): resolves the
  booth via `get_booth_for_order(p_short_code)` (public-safe — omits
  `cost_cents`/`short_code`), distinguishes a real RPC error (shows a
  retryable `ExpiredCode variant="error"`) from an unresolved code (hard
  `ExpiredCode`), computes open/closed state via `isBoothOpen`/
  `nextOpenLabel`, and renders the booth header, `RecentOrders`, a closed
  banner when applicable (with the booth's resolved social links, so a
  stranded customer can still reach the vendor — `get_booth_for_order`
  resolves booth-override-vs-vendor-default, migration `0053`), and
  `OrderForm`. Also parses `menu_categories` (migration `0066`, previously
  fetched by the RPC but dropped by this page's own Zod schema) via
  `parseMenuCategories` and passes it through to `OrderForm`. The outer
  container widens to `md:max-w-2xl` (2026-09-15) so `OrderForm`'s
  two-pane sidebar layout has room beside the item list on tablet/desktop;
  the header/hero-image/closed-banner block stays wrapped in its own
  `md:max-w-lg` so it doesn't stretch wide alongside the wider menu below.
  `loadBasketLimits` calls `booth_availability` (migration `0096`) for the
  items left in the booth's daily total and its per-order limit, either null
  when not set: zero left makes the page read "Sold out for today" and closes
  ordering. Both go to `OrderForm`, which stops a basket at them and prints
  the "Only N items left today" note itself (`StockNotice`), from availability
  net of other baskets' holds, so it can never contradict "the last items are
  in other baskets". The total this page uses is the stock itself, with no
  basket hold taken off: the server cannot tell which hold is the visitor's
  own. Read
  separately from `get_booth_for_order` to leave that RPC's public-safe shape
  alone, and degraded to "no limits" on any failure, since the triggers are
  the real limits.
- `hold-actions.ts` — `holdCart(boothId, session, lines)` places or renews the
  basket's hold (`hold_cart`, migration `0096`) behind a per-IP guard and
  returns the availability the customer should see; `readAvailability` only
  reads, for the menu's periodic refresh. Both return null when the call
  could not be made, and the caller keeps what it was showing.
- `hold-actions.test.ts` — unit tests (RPC mocked): the hold and read calls,
  validation refusing before any RPC, the per-IP guard, and null on error.
- `loading.tsx` — animated skeleton (title bar + 5 placeholder menu rows)
  shown while `page.tsx`'s server fetch resolves — the QR-scan hot path,
  where event-site network can be slow.

## Connectivity

Reached at `/o/<short_code>` from a booth's QR code. `page.tsx` renders
`OrderForm` (`@/components/order/order-form.tsx`), which imports and calls
this folder's `actions.ts#placeOrder` directly on submit; on success it
navigates to `/order/[boothId]/[orderNumber]?t=<accessToken>` for live status.
`placeOrder` also calls `@/lib/merqo/customer-notify`'s `notifyVendor` via its
own `notifyVendorTelegram` helper — merqo's shared bot resolves the vendor's
linked chat itself; a vendor connects that link once via merqo's own
`/profile` page, not through anything in this repo. It likewise calls
`@/lib/printkit/client`'s `createPrintJob` via its own `notifyPrintkit`
helper, gated on the booth's `print_enabled` flag (`booths.print_enabled`)
— an order for a booth that hasn't opted into printing never fires this
call at all.

## Parent

[o](../README.md)
