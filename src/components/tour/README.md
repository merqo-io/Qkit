# tour

## Purpose

The dashboard's guided tours: qkit's wiring of `@merqo/ui`'s
`DashboardTours`, and the step config it is given.

## Contents

- `dashboard-tour.dom.test.tsx` — RTL tests confirming qkit wires the right
  `tours`/`pathname`/`seenTourIds`/`onFirstSeen`/`scopeClassName` props
  through to `DashboardTours` (the tour mechanism itself is tested in the
  shared package).
- `dashboard-tour.tsx` — `DashboardTour({ toursSeen })`: thin wiring around
  `@merqo/ui`'s `DashboardTours` — registers qkit's per-page tours (`orders`
  at `/dashboard`, `boothsTourSteps` resolved lazily via `matchMedia` at
  tour-start time; `booths` at `/dashboard/booths`), derives `seenTourIds`
  from `Object.keys(toursSeen)`, wires `markTourSeen` as `onFirstSeen`, and
  sets `scopeClassName="qkit-tour"` for the popover theme. The tour mechanism
  itself (driver.js lifecycle, auto-run/replay timing, floating "?" replay
  button, popover styling, route-to-tour matching) lives in the shared
  package — only which tour applies to which route, and what each one says,
  is qkit-local. Renamed from a single-tour `{ seen }` prop shape (2026-09-15)
  once the booths page needed its own tour instead of always redirecting to
  `/dashboard` to replay the orders one.
  The replay button is hidden while the board's selection bar is open (a
  `globals.css` rule keyed on `data-selection-bar`), since on a phone it
  covers the bar's right-hand action.
- `tour-steps.test.ts` — unit tests asserting the mobile/desktop step lists
  for `ordersTourSteps` and the single step for `boothsTourSteps`.
- `tour-steps.ts` — pure step config (element selector + title +
  description), kept free of any `driver.js` import so it's unit-testable,
  one function per dashboard tour (see `dashboard-tour.tsx`'s `TOURS`
  registry): `ordersTourSteps(isMobile)` covers the full order lifecycle
  (accept/mark ready/mark picked up/confirm payment), bump and auto-clear,
  and walk-up ("New order") orders — not just navigation landmarks; desktop
  spotlights each nav landmark too, mobile spotlights the collapsed hamburger
  menu instead. Its first step's "example order" preview renders the real
  `OrderStatusBadge` via `react-dom/server`'s `renderToStaticMarkup` instead
  of a hand-copied color/label, so it can't silently drift from what the real
  badge looks like — see
  `../../../docs/superpowers/specs/2026-08-25-tour-example-badge-drift-fix-design.md`
  (outside this repo's own git tree, a cross-kit spec). Its final step also
  tells a vendor which booth-page sections are optional (Payment, Printing,
  Booking Status), since the tour ends before those sections are ever on
  screen. `boothsTourSteps()` (2026-09-15) is a single step anchored on
  `[data-tour="new-booth"]` — the one always-present element regardless of
  plan tier or existing booth count, since a brand-new vendor (this tour's
  actual audience) has no booth cards yet for driver.js to spotlight. Kept
  free of `@/lib/tour-ids`'s `TOUR_IDS`/`tourIdSchema` on purpose — this
  file's `renderToStaticMarkup` import (react-dom/server) can't be pulled
  into a "use server" file's import graph (`tour-actions.ts` needs the
  allowlist too), which Next.js rejects as a bundle-boundary error.

## Parent

[components](../README.md)
