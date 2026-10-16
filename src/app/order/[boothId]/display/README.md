# display

## Purpose

Public, unauthenticated TV/second-screen queue display for one booth —
meant to run on a screen near the booth, not a customer's own phone. Answers
Manfred's second-event AAR pain point (item B, `docs/meta/2026-09-10-manfred-
second-aar-feature-backlog.md`): the "uncle" segment won't self-monitor a
phone, so the vendor marking an order "ready" on their own board needs to
show up somewhere a customer glancing at a shared screen will actually
notice.

## Contents

- `actions.ts` — `getBoothQueueDisplay(boothId)`: service-client read of one
  booth's active (non-terminal) orders, shaped down to
  `{ orderNumber, displayNumber, status }` — no customer name/phone/payment/
  items, the least a screen visible to anyone near the booth needs. No
  per-viewer secret to check (unlike the token-gated
  `../[orderNumber]/status-actions.ts`): this screen is meant to be readable
  by anyone near the booth, so `booth_id` alone is the read key — the same
  trade `getWaitEstimate` already makes internally, just reached here with
  no token-gated entry point in front of it. Computes the daily-reset
  display number the same way `../[orderNumber]/page.tsx`'s
  `resolveHeadingNumber` does (one extra query for the booth's first order
  of the SGT day, only when `board_settings.daily_order_number_reset` is
  on). The Ready group comes first, sorted by `ready_at`, most recently
  readied first, so a number keeps its place as it ages. Preparing follows,
  sorted with the same priority-bump-then-oldest-first rule as
  `sortActiveOrders` (`@/lib/orders`), reimplemented locally against this
  query's narrower row shape rather than imported. Returns `null` (not `[]`)
  on a real read failure, so the poller can tell "booth has no active
  orders" apart from "the read broke" and keep showing the last good state
  either way.
- `actions.test.ts` — unit tests (mocked Supabase chains) for the booth-
  not-found/booth-read-error/orders-read-error null returns, the
  priority-bump sort, the ready-time sort of the Ready group, the
  least-privilege column list, the auto-clear-only grace window, and the
  daily-reset display-number computation.
- `page.tsx` — `BoothQueueDisplayPage` (route entry, `revalidate=0`):
  validates `boothId` as a UUID (`notFound()` otherwise, same as
  `../page.tsx`), confirms the booth exists (service client — anon can't
  read `booths` directly, see `../README.md`), then renders `QueueDisplay`
  seeded with `getBoothQueueDisplay`'s initial snapshot (`[]` on a read
  failure, so a transient DB hiccup at page-load never breaks the screen
  outright — the client poller gets its own chance to recover).
- `page.dom.test.tsx` — RTL test rendering `BoothQueueDisplayPage` directly
  (same pattern as `../[orderNumber]/page.dom.test.tsx`), `QueueDisplay`
  stubbed out (own dedicated test file): the notFound branches for an
  invalid boothId and a missing booth, and that a real booth's name/id/
  initial orders reach `QueueDisplay` as props.
- `queue-display.tsx` — `QueueDisplay({ boothId, boothName, initialOrders })`
  client component: polls `getBoothQueueDisplay` every 5s (`usePolling`,
  same 5s cadence as `../[orderNumber]/order-status-poller.tsx` — no
  realtime here either, same rationale). Diffs each poll against the
  previous status snapshot (seeded from `initialOrders` on mount, so
  orders already `ready` before the page loaded never falsely flash).
  Forces the app's own `.dark` theme on this page regardless of the
  viewing device's OS setting — a genuine digital-signage board reads
  better on a dark ground with bright accents than a light one, and the
  choice follows from the use scene (a TV/kiosk screen at a market or
  event, day or night), not the visitor's own preference.

  Every tile emphasizes its number's trailing digit (underlined, via
  `splitTrailingDigit` in `@/lib/orders`) rather than the whole number
  uniformly, so a vendor using a physical pickup-shelf-slot system
  (bubble-tea-chain style — slotting an order by its last digit) can read
  it at a glance, in both the Preparing and Ready columns.

  A `ready` order carries a **freshness** cue, not just a one-shot flash:
  it's a solid, bright `bg-primary` fill (the app's own warm accent, not
  a status/semantic color) for `FRESH_MS` (5 minutes) after it first went
  ready, then eases (`transition-colors duration-700`) into a muted
  `bg-primary/10` tint — a rough "is this still hot" proxy so a glance at
  the Ready column tells a customer or vendor which numbers just got
  called versus which have been sitting a while. `readyAt` (a
  `Map<orderNumber, timestamp>`, React state) records when each currently
  -ready order first transitioned, seeded empty on mount so an order
  already `ready` in `initialOrders` has no entry and renders aged from
  the start (matches the old "no false flash on load" behavior); `nowMs`
  (also state, ticked every 30s by its own effect, same
  seed-null-then-`useEffect` pattern as
  `../[orderNumber]/order-status-poller.tsx`'s own `nowMs`) supplies the
  "now" side of the age math — both are plain state rather than refs
  because render must stay pure (no reading a ref or calling `Date.now()`
  directly in the render body; the `react-hooks/purity`/`react-hooks/refs`
  lint rules catch this). On top of that, the moment an order first
  transitions it also gets a brief one-time "stamped" entrance (tilts
  `-rotate-3`, `fade-rise`) for `FLASH_MS` (3.5s) — the same reveal the
  customer's own status page already uses for its "Ready" moment
  (`order-status-poller.tsx`'s `status === "ready"` block) — layered on
  top of, not instead of, the freshness fill. Preparing tiles stay a
  quiet, uncolored card throughout — the Ready/Preparing contrast is the
  entire point, so only Ready ever carries color. Freshness never
  reorders the grid: tiles render in the server's order (most recently
  readied first), so the newest number already sits in the first slot and
  stays in order as it ages instead of jumping back once it stops being
  fresh. Sound is opt-in and
  separate from the visual cue on purpose: `playReadyChime`
  (`@/lib/order-alerts`) uses the Web Audio API, which browsers keep
  suspended until a user gesture unlocks it — a TV tab nobody touches
  would never unlock it, so a chime call before that gesture would
  silently never play. An "Enable sound" button (shown until tapped)
  calls the shared `unlockAudio()` export once, meant to be tapped by the
  vendor when they set the screen up; if it's never tapped, the display
  still works fully via the visual cue alone. Preparing and Ready for
  pickup render side by side (`grid-cols-2` from `sm:` up, stacked below
  it, a dashed vertical rule between them echoing the perforation motif
  used elsewhere in this app) rather than stacked full-width, so a long
  Preparing list can't push Ready off the bottom. The whole page is
  `h-screen overflow-hidden` — a TV screen has no scroll — so each column
  also caps how many tiles it ever renders
  (`MAX_VISIBLE_PREPARING`/`MAX_VISIBLE_READY`, fixed numbers tuned for a
  landscape screen rather than measured against the real viewport) and
  shows a "+N more" line for whatever's hidden past the cap. Preparing
  drops the newest orders first (the ones a customer's been waiting on
  longest stay visible); Ready drops the longest-ready, so a just-called
  number is never one of the hidden ones.

- `queue-display.dom.test.tsx` — RTL tests for the Preparing/Ready
  grouping, each group's own empty state, that a poll updates the
  rendered orders, that a genuine ready-transition gets both the
  `fade-rise` stamp class and the solid fresh-fill class while an order
  already ready on mount renders aged/muted from the start, the
  silent-by-default chime behavior, the "Enable sound" button's own click
  effect, a transient poll failure (`getBoothQueueDisplay` returning
  `null`) keeping the last good state instead of clearing the screen,
  each column's own render cap plus its "+N more" line, and that a
  fresh tile keeps its server position rather than moving to the front.

## Connectivity

Linked to from `src/app/dashboard/booths/booth-list.tsx`'s "Open TV
display" button (`/order/{boothId}/display`, opened in a new tab) — not
reachable from anything in the customer order flow, and carries no token.
`queue-display.tsx` polls `actions.ts`'s `getBoothQueueDisplay`, the same
service-client-bypasses-RLS pattern `../[orderNumber]/status-actions.ts`
uses, just without a per-order secret gating it.

An auto-cleared order (`auto_completed`, set only by the ready auto-clear
sweep) keeps its place on the screen for `COLLECTED_GRACE_MS` (10 minutes),
still shown as ready. One marked picked up, by staff or by the customer's own
pickup scan, leaves the screen at once: the customer has it. `board_settings.ready_auto_clear_min` marks an
order collected whether or not anyone picked it up, so dropping it the moment
it goes terminal could blank a number while the cup was still on the shelf, and
a customer who was not watching their phone at that moment had nothing left to
check. Past the window it drops off, so the screen does not accumulate a whole
service. An order with no `completed_at` is dropped rather than pinned up.

## Parent

Queue reads page through the API row limit with a stable ID cursor, so earlier
orders completing between pages cannot hide the next order. A later-page failure
returns no replacement snapshot, so polling preserves the last complete display.

[[boothId]](../README.md)
