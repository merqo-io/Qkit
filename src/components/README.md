# components

## Purpose

Shared React components used across the vendor dashboard, the marketing
landing page, and the customer ordering flow — everything that isn't a raw
shadcn primitive (`ui/`) or ordering-flow-specific (`order/`).

## Contents

- `landing/` — the sticky landing-page nav (`Nav`, composing `@merqo/ui`'s
  `LandingNav` shell) and the standalone wordmark used on the login page
  (`Wordmark`). See its own README.
- `order/` — components specific to the customer ordering flow (menu/cart
  form, recent-orders list, expired-code screen). See its own README.
- `ui/` — the shadcn/ui primitive library everything else in this tree is
  built from. See its own README.
- `board/` — the vendor's order ticket (`OrderCard`), its status badge and the payment-proof viewer. See its own README.
- `layout/` — app-shell pieces mounted once in the root layout (providers, service-worker registrar, maintenance banner). See its own README.
- `tour/` — the dashboard's guided tours and their step config. See its own README.
- `widgets/` — presentational pieces used by more than one feature (ticket shell, hints, pagination, images, segmented switch, page header, ...). See its own README.

## Connectivity

`ui/` is the shadcn/ui primitive library everything else in this tree is
built from; `order/` holds components specific to the customer ordering flow
and is consumed by `src/app/o/[code]/page.tsx`. The `landing-*` family
(`landing-board`, `landing-boards`, `landing-ticket`, `landing-cta`)
renders the marketing landing page alongside
`hero-preview-carousel.tsx`, shared `BackToTop` from `@merqo/ui`, and `landing/`'s `Nav`. Its
sibling `landing/`-`Wordmark` is consumed only by the login page, outside the
landing route. `order-card.tsx` and
`dashboard-tour.tsx` are consumed by the vendor dashboard
(`src/app/dashboard`); `dashboard/booths/menu-editor.tsx` and
`dashboard/booths/option-groups-editor.tsx` render their Price/Cost fields via
`@merqo/ui`'s `MoneyInput`, not a local component; `ticket.tsx`/`ticket-section.tsx` are the shared card
shell used by both the dashboard and the ordering flow. `feedback-form.tsx` posts
to a server action under `src/app/actions/`. `payment-proof-viewer.tsx`
(dynamically imported by `order-card.tsx`) calls `getOrderPaymentProof` in
`src/app/dashboard/payment-evidence-actions.ts` for the photo link and
paykit's signals. It reads nothing out of the photo itself: paykit checks the amount on its server.

## Shared package note

`back-to-top.tsx` moved to `@merqo/ui` (v0.31.0) as `BackToTop` — it was byte-identical across four kits.

## Parent

[src](../README.md)
