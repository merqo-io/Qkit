# stats

## Purpose

Vendor-facing sales analytics: revenue/orders/AOV, trend, margin, busy-hours,
top items, service speed, and customer reviews — gated by plan (free/pass see
"today" only, Pro unlocks history, trends and margin) and by paid "event"
passes that keep a permanent, ungated stats snapshot for that window.

Paid-event reviews match orders placed in the event window across complete paged
feedback reads. The live review list keeps its explicit 500-row recent limit.

## Contents

- `actions.ts` — `renameEvent({ licenseId, label })` server action: renames a
  paid pass to a vendor-chosen event-day name via the `set_license_label`
  SECURITY DEFINER RPC (scoped server-side to `vendor_id = auth.uid()`), then
  revalidates `/dashboard/stats`.
- `busy-heatmap.tsx` — `BusyHeatmap({ summary })`: a pure-CSS 7×24 day×hour
  grid coloured by order volume (opacity scaled to the max cell), with a
  computed "Peak <day> <hour>" caption; no chart library.
- `chart-format.ts` — shared formatting helpers: `RANGE_LABEL` (chart eyebrow
  text per range key), `rangeCaption(range)` (KPI-strip caption, e.g.
  `"24h"` → `"today"`, `"event"` → `"this event"`), `hourLabel(h, {long})`
  (`"9a"`/`"9am"`), `fmtWait(seconds)` (compact `"4.2m"`/`"45s"` for axes),
  `waitClock(seconds)` (readable `"4m 12s"` for KPI cards).
- `chart-format.test.ts` — unit tests for `hourLabel` and `fmtWait` edge
  cases (midnight/noon, sub-minute vs. minute+ rounding).
- `event-stats-view.tsx` — `EventStatsView` (async server component): renders
  one paid license window's full stats regardless of current plan tier —
  fetches orders for `[valid_from, expires_at)`, computes a trend anchored to
  the window end, pulls reviews scoped to orders placed in that window
  (`fetchEventReviewRows`), and reuses `StatsView`/`ReviewsCard` with
  `range="event"`.
- `events-panel.tsx` — `EventsPanel({ events })` + internal `EventRow`:
  lists the vendor's paid licenses as permanent "events" linking to
  `?event=<id>`; each row can be renamed inline via `renameEvent`.
- `export-button.tsx` — `ExportButton({ summary, range, boothId })`: builds a
  `SalesSummaryV1` via `@/lib/sales-summary` and downloads it as a CSV blob
  named `qkit-sales-<range>.csv`. The items table lists every item in
  `summary.topItems` (capped at 50 by `computeStats`, not the v1 top 10) plus a
  `Total items` row.
- `tile-layout.ts` — `WIDE_ON_PHONE`: the class that gives a tile the whole
  row on a phone. The strip is two tiles across there, about 118px of text
  each, which cut the revenue figure ("$1,804.…") and the best seller's name
  short. Revenue and Best seller take it via each tile's `wide` prop. A plain
  module because one tile file is a Client Component: a Server Component
  importing a string from it would get a client reference, not the string.
- `kpi-row.tsx` — `StatTile` (qkit's bordered/fade-rise card shell wrapping
  `@merqo/ui`'s shared `StatTile` content — label + delta pill + mono value
  - caption) and `KpiRow({ summary, deltas, pro, rangeLabel,
allTime })`: renders Revenue/Orders (as `StatBreakdownTile`s with a
    per-item hover/tap breakdown) + Avg order, and (Pro only) Fulfilled
    (completed/decided with a cancelled-count tooltip) and Refunds.
- `margin-table.tsx` — `MarginTable({ summary })` (Pro; the Item column wraps,
  so a long name no longer pushes Profit and Margin off a phone screen
  behind a sideways scroll): ranks
  `summary.topItems` by `profit_cents` (only where `cost_cents > 0`), shown
  only when the vendor has entered at least one item cost; renders via
  `@merqo/ui`'s shared `DataTable`. `"use client"` — its `columns`
  (`cell`/`getRowKey` functions) can't cross the server→client boundary into
  `DataTable`, which is a Client Component with callback props defined on the client side.
- `options-breakdown.tsx` — `OptionsBreakdown({ options })`: wraps labels to show the full customization choice in a horizontal bar
  list of the most-picked customization choices (e.g. "Iced", "Less sugar"),
  hidden when no item has options.
- `page.tsx` — `StatsPage` (route entry, `revalidate=0`): resolves the
  vendor's booths + licenses, dispatches to `EventStatsView` when `?event=`
  matches a license, otherwise clamps the requested `range` to the
  entitlement's `statsRanges`, fetches range/prior-range orders + reviews +
  all-time totals in parallel via `queries.ts`, computes `StatsSummary`
  (`@/lib/stats`) and period deltas, and renders
  `StatsControls`/`StatsView`/`ReviewsCard`/`EventsPanel`.
- `queries.ts` — Supabase read helpers: `fetchOrders` (windowed order rows,
  parsed items), `fetchAllTimeTotals` (lifetime order count + revenue,
  non-cancelled, unfiltered by range/booth), `fetchReviewRows` (up to 500
  customer reviews for the vendor's booths), `fetchEventReviewRows` (reviews
  for orders placed within an event window, keyed by order date not review
  date).
- `reviews-card.tsx` — `ReviewsCard({ groups, overall, selected, range,
linkable })`: fractional-star `Stars`, a rating `Distribution` bar chart,
  and either one booth's detailed/paged comments (`BoothDetail`) or an
  all-booths overall average + per-booth comparison list.
- `service-speed-chart.tsx` — `ServiceSpeedChart({ series, range,
peakThroughput })` (Pro): a Recharts `ComposedChart` — order-volume bars
  plus an average-wait line with a dashed reference line at the mean.
- `stat-breakdown.tsx` — `StatBreakdownTile`: a `StatTile`-styled button
  wrapping a Radix `Popover` that reveals a per-item breakdown on mouse
  hover or touch tap (pointer-type–aware so iOS doesn't double-fire).
- `stats-components.dom.test.tsx` — RTL tests across `KpiRow`, `MarginTable`,
  `ServiceSpeedChart`, and `StatsView` using fixture `StatsSummary`/`TopItem`
  builders.
- `stats-controls.tsx` — `StatsControls({ range, booth, booths,
allowedRanges })` (client): the range-tab + booth `Select` bar; an
  out-of-plan range renders as a locked `Link` to `/dashboard/plan` instead
  of a switch.
- `stats-view.tsx` — `StatsView({ summary, deltas, series, range, boothId,
pro, speed, allTime })`: the main render — pinned KPI strip + best-seller/
  busiest-hour/avg-wait tiles, then (Pro) a `Tabs` of Sales/Items/Service
  (lazy-loaded `TrendChart`/`ServiceSpeedChart`/`TopItems` via
  `next/dynamic` so Recharts isn't in the initial bundle) or (free) a capped
  `TopItems` + an upgrade banner. `Stagger` staggers each section's fade-rise
  animation.
- `top-items.tsx` — `TopItems({ items, limit })`: a Recharts horizontal bar
  list, toggleable between "By volume" and "By revenue" ranking.
- `trend-chart.tsx` — `TrendChart({ series, range, title })` (Pro): a Recharts
  `AreaChart` of revenue over the window, with an abbreviated Y-axis
  (`shortMoney`) and a full-precision tooltip.

## Connectivity

`page.tsx` is the route entry for `/dashboard/stats`, reached from the
dashboard nav. It computes everything server-side via `@/lib/stats` +
`queries.ts` and hands the result down through `StatsView` (which lazily
imports the Recharts-based children) and `ReviewsCard`/`EventsPanel`.
`event-stats-view.tsx` is an alternate entry point `page.tsx` dispatches to
when a paid license is selected, reusing the same `StatsView`/`ReviewsCard`.
`actions.ts#renameEvent` is called only from `events-panel.tsx`. Shared
formatting (`chart-format.ts`) is imported by nearly every chart/tile in this
folder so range labels and wait/hour formatting can't drift between them.

## Parent

[dashboard](../README.md)

Order statistics paginate in a stable id order through the API row cap. A failed
page raises an error rather than showing partial totals. Review displays retain
the documented 500-row global cap. Booth/pass lists paginate; all stats query
booth-ID filters are deduplicated and split into batches of at most 100 IDs.
queries.test.ts covers row caps, large booth filters and later-page failures.
