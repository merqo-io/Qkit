# completed

## Purpose

Paginated history of a vendor's completed orders — the live board drops an
order from view the moment it's marked picked up (by design, so the active
queue stays uncluttered); this is where a vendor pulls it back up.

## Contents

- `completed-orders-list.dom.test.tsx` — RTL tests for `CompletedOrdersList`:
  the empty state, the load-error banner, one `OrderCard` per order, the
  booth banner only appearing for a multi-booth vendor, pagination past the
  first page, the always-visible page count, the booth filter, the search
  box, the no-match state, the history-cap note, and defaulting to "Today"
  then widening through 7 days/30 days/All time as more orders come into
  range, and the older-orders note.
- `completed-orders-list.tsx` — `CompletedOrdersList({ booths, orders,
loadError, historyLimit, todayStartIso })` client component: a date-range
  segmented filter (Today/7 days/30 days/All time, filtering on
  `completed_at` — falls back to `created_at` if unset — defaulting to
  **Today**). The "Today" cutoff is `todayStartIso` — computed once,
  server-side, via `sgtStartOfDayIso()` (`page.tsx`) — rather than a
  client-local `new Date()`: the server likely runs UTC while a vendor's
  browser runs SGT (or whatever their device is set to), so an
  independently-recomputed local midnight would put the boundary up to 8
  hours apart between server and client renders, a real hydration mismatch
  now that "Today" is the default instead of an opt-in click. "7 days"/"30
  days" stay locally computed (`Date.now()` minus N days) — safe, since
  they're never the initial state, only reached after a vendor's own
  post-hydration click. A booth-filter `Select` (multi-booth only), and a
  search `Input` (order number or customer name, case-insensitive
  substring) narrow `orders` client-side before rendering a `Paginated`
  (`variant="pager"`, 12/page, `alwaysShowCount` so the "x–y of N" readout
  confirms nothing got filtered away even on a single page) grid of
  `OrderCard`s (`showDate` — every card here spans potentially months,
  unlike the live board's same-day cards). Separate empty states: "No
  completed orders yet" (nothing at all) vs. "No matching orders"
  (filter/search narrowed to zero). A retry banner on a load error, and a
  one-line note when the fetch hit `historyLimit` (the list isn't
  unbounded). The optional `olderHidden` prop adds the line "Older orders are
  kept and show on Pro."
- `page.tsx` — `CompletedOrdersPage()` (server, `revalidate = 0`): reuses
  `requireEntitledVendor()`, reads the vendor's booths, then reads up to 500
  `status = 'completed'` orders across them (`BOARD_ORDER_COLUMNS`, newest
  `completed_at` first), computes `sgtStartOfDayIso()` once, and renders
  `CompletedOrdersList`. Free and Starter get `completed_at >=
sgtYesterdayStartIso()` in the query (today and yesterday only); one
  `limit(1)` read for an older row sets `olderHidden`. Pro and a running Event
  Pass are unfiltered.

## Connectivity

Reached at `/dashboard/completed`, linked from `dashboard-nav.tsx`'s `LINKS`.
`page.tsx` runs the same booths→orders query shape as `../page.tsx` (the live
board), just filtered to `completed` instead of excluding it, and passes the
result to `completed-orders-list.tsx`. `OrderCard` (`@/components`) hides fulfillment actions for completed orders.
Payment review and explicit settlement remain available for unpaid completed
orders; collection never confirms payment.

## Parent

[dashboard](../README.md)
