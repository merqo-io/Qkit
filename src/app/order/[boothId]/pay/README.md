# pay

## Purpose

The pay step for an order that has no number yet. `placeOrder`
(`src/app/o/[code]/actions.ts`) defers assigning `order_number` for any
payment-required order (see migration 0087), so `OrderForm` redirects here
(`/order/{boothId}/pay?t={token}`) instead of to the numbered `[orderNumber]/`
status page when `placeOrder` returns a null `orderNumber`.

The customer does not pay on this route. It sends them to a page paykit
hosts, where they see the payment code, attach a screenshot and tap "I've
paid"; paykit then sends them back here. On that return the order is claimed
on paykit's side, so `loadPreClaimContext` gives it its number and this page
redirects to the numbered status page. If the customer closes the tab on
paykit's page instead, paykit's callback (`/api/paykit/payment-status`)
gives the order its number anyway.

## Contents

- `page.tsx` — `PayPage` (route entry, `revalidate=0`): validates `boothId`
  as a UUID and `t` (the access token) as present and well-formed
  (`notFound()` otherwise), reads this app's own origin (`requestOrigin`,
  `notFound()` when the request names no host of ours) and calls
  `loadPreClaimContext(boothId, token, origin)` (`notFound()` on null: a bad
  token, or an order that never required payment). Then, by state: `placed`
  redirects to the numbered page, `pay` redirects to paykit's `pay_url`,
  `cancelled` and `expired` render a closed-order notice that says not to pay,
  and `unavailable` renders "Could not open the payment page" with a "Try
  again" link back to this route.
- `page.dom.test.tsx` — RTL test rendering `PayPage` directly: the
  `notFound()` branches (invalid booth, missing token, null context, no host),
  each redirect, and the closed and unavailable notices.

## Connectivity

Reached only via `OrderForm`'s redirect (`src/components/order/
order-form.tsx`) when `placeOrder` returns `orderNumber: null`, and as the
`return_url` paykit sends the customer back to. It calls `loadPreClaimContext`
(`../[orderNumber]/payment-actions.ts`), which calls paykit's checkout API.
`return_url` must be on the origin paykit has registered for qkit
(`kit_api_keys.return_origin`), so a deployment on a new origin cannot use
this step until that is set.

## Parent

[[boothId]](../README.md)
