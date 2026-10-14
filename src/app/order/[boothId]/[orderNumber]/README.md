# [orderNumber]

## Purpose

Live customer order-status page — the page a customer lands on right after
placing an order (and can return to via "recent orders"). A payment-required
order with `payment_status` still `"pending"` is redirected to `../pay`
instead of rendering here (that page owns the actual QR/link/image checkout
UI; this page can only see `"pending"` via a stale bookmark from before
`../pay` existed). Polls status and payment state, shows a claimed/confirmed
pay panel once a payment-required order is past that gate, offers a "Get
notified on Telegram" connect button while the order is still waiting, and
surfaces a loyalty "earn a stamp" link once the order completes.

## Contents

- `collect-actions.ts` — `confirmCollection(boothId, orderNumber, token)`:
  the self-checkout pickup kiosk's server action (`../pickup/`). Token-gated
  and rate-limited like the other customer actions (20/60s per IP+booth — a
  busier limit than the payment actions since a kiosk can legitimately fire
  many scans in a shift). Distinguishes three non-error outcomes a `ready`
  order can already be in: `"Not ready yet."` (still `preparing`/etc.),
  `"Already collected."` (a double-scan, `status === "completed"`), and a
  successful `{ success: true, status: "completed" }` for the one legal
  transition — flips the order to `completed` via the same
  `buildAdvancePatch`/guarded-UPDATE/re-read-on-0-rows pattern
  `advanceOrder` (`src/app/dashboard/order-actions.ts`) uses, then logs a
  `recordOrderStatusEvent` with `actor: null` (no authenticated user at an
  unattended kiosk, unlike every other caller of that function).
- `collect-actions.test.ts` — unit tests for the ready/not-ready/already-
  completed/invalid-ref/rate-limited branches, plus the update-race
  ("Order changed") and update-error paths.
- `earn-link.tsx` — `EarnLink({ orderId, vendorId, loopkitBaseUrl })` (async
  server component): fetches the vendor's LoopKit earn-program config from
  `NEXT_PUBLIC_LOOPKIT_URL` (bearer-authed with `MERQO_METRICS_SECRET`,
  3s timeout, fails closed to `{ enabled: false }` on any error/timeout) and
  renders an "Earn a stamp" link to `loopkit/earn?order=<id>` only when
  enabled.
- `earn-link.dom.test.tsx` — RTL tests for `EarnLink`'s enabled/disabled/
  fetch-failure branches.
- `telegram-connect.tsx` — `TelegramConnect({ orderId, vendorId })` (async
  server component, same shape as `EarnLink`): mints a single-order-scoped
  connect token from merqo (`mintCustomerConnectToken`,
  `@/lib/merqo/customer-notify`, `notify_ref` `` `qkit:${orderId}` ``) and
  renders the deep-link button plus a one-line disclosure preview — merqo's
  own connect flow holds the actual consent copy, this never restates or
  diverges from it — or `null` on any mint failure (a merqo outage must
  never break this page, same fail-closed rule as `EarnLink`).
- `telegram-connect.dom.test.tsx` — RTL tests for `TelegramConnect`'s
  successful-mint (link + disclosure) and failed-mint (`null`) branches.
- `loading.tsx` — animated skeleton matching the real ticket's shadow/layout,
  shown while `page.tsx`'s server reads resolve.
- `order-status-poller.tsx` — `OrderStatusPoller` client component: polls
  `getOrderStatus` + `getWaitEstimate` every 5s (`usePolling`, paused once
  terminal) — poll-only by design since Supabase realtime is unreliable on
  customer devices (Safari/iOS, in-app webviews). Two checks in a row that
  fail, or that the server cannot answer, show a "No connection. Last
  checked ..." notice until one succeeds, so the page never keeps promising
  a status it can no longer see. `status === "pending"` can
  mean either of two independent gates (`requires_arrival_confirm`, or no
  printer connected — migration 0086), told apart by the `requiresArrivalConfirm`
  prop from `page.tsx`: with it on, a dedicated early-return branch shows no
  progress bar/badge chrome, just a "You're order #N. We start making it
  fresh once you're at the counter" message (the order number re-anchored in
  the sentence itself, not just the ticket header above — pickup-confusion
  mitigation from Manfred's first-event AAR) and a big "I'm here, start my
  order" button that calls `confirmArrival` (optimistic local
  `setStatus("preparing")` on success, an error toast on failure) — the
  customer stays on this branch until either they tap it or the next poll
  observes the vendor already started it some other way (e.g. the vendor's
  own board). With it off (print-gated pending only), a passive variant of
  the same branch shows the order number sentence with no button at all —
  only the vendor's own "Start now" tap can move the order on, since
  `confirmArrival` itself refuses when the booth doesn't require arrival
  confirmation (see `status-actions.ts` below). Kitchen status and payment
  status advance
  independently (a vendor can mark an order preparing/ready before the
  customer pays), so an `awaitingPayment` prop (from `page.tsx`) overrides
  the confirmed/preparing/ready copy while the stall is still checking a
  payment the customer has sent — e.g. "The stall is still checking your
  payment. Stay close." — so the text never implies payment is settled
  when it isn't, and never asks again for a payment already made (an unpaid
  order is on `../pay`, not here). A `paymentSent` prop makes a cancelled
  order say how to get a refund when the customer had paid. Once past `pending`, renders the progress bar
  (`orderProgressIndex`/`ORDER_PROGRESS_SEGMENTS`), a prominent range-based
  wait estimate (`estimateRangeLabel`, e.g. "6-10 min" — a range rather than
  a precise countdown, since waiting-line research says an unmet precise
  promise erodes trust more than an upfront-honest range) that falls back to
  a queue-position label (`queuePositionLabel`, e.g. "2 orders ahead of
  you") instead of showing nothing when there isn't enough recent history
  for a time estimate yet, an "Alert me when it's ready" opt-in that unlocks
  audio + requests `Notification` permission, and on transition to `"ready"`
  fires a system notification (`fireReadyNotification`), plays a chime, or
  flashes the tab title if backgrounded. The ready-state copy repeats the
  order number ("Order #N ready, please collect now") instead of a generic
  "please collect your order now" — same pickup-confusion mitigation as the
  pending-state message above.
- `order-status-poller.dom.test.tsx` — RTL tests covering the poll loop,
  status transitions, the ready-state alert/notification/title-flash paths,
  and the enable-alerts permission flow.
- `page.tsx` — `OrderStatusPage` (route entry, `revalidate=0`). `resolveStaleView`
  (wrapping `isStaleOrderView` in `@/lib/orders`, kept out of the component body
  because reading the clock during render trips `react-hooks/purity`) flags a
  view of an order placed more than `STALE_ORDER_VIEW_HOURS` ago: a repeat
  customer's browser can restore an earlier visit's status URL, and the page
  then looks live while showing a number the stall is not calling (once the
  daily rank would be non-positive, `displayOrderNumber` returns the raw
  permanent `order_number`) for a row the vendor is not working on. Such a view
  renders an "This is an older order" block with the placed date and a link to
  `/order/{boothId}`, and skips the `TelegramConnect` offer. It otherwise
  validates
  `boothId`/`orderNumber`/the `?t=` access token, reads the order + booth in
  parallel via the **service client** (customers are unauthenticated; the
  token match is what authorizes the read, not RLS), distinguishes a real
  DB error (retryable error boundary) from a genuine 404 (`maybeSingle` →
  null), then redirects to `../pay?t=<token>` if `order.payment_status` is
  still `"pending"` (a stale-bookmark guard — `../pay` is the only place a
  payment-required order gets claimed now; this page never renders the
  QR/link/image checkout itself). Past that gate, gates the pay panel purely
  on the local `order.payment_status` mirror (`!== 'not_required'` and not
  cancelled — set by `qkit.place_order` at order-creation time from
  `booths.payment`'s `{kind}` marker); `PayPanel` itself only ever needs to
  show the claimed/confirmed states from here on. From that same `showPay`
  gate plus `order.payment_status !== 'confirmed'`, an
  `awaitingPayment` flag passed to `OrderStatusPoller` so its status copy
  never outruns the actual payment state, plus the booth's own
  `requires_arrival_confirm` column (now part of the same booth read) as a
  `requiresArrivalConfirm` prop, telling `OrderStatusPoller` which of the two
  reasons a `'pending'` order can show apart, and renders the ticket
  header, `OrderStatusPoller`, `TelegramConnect` (gated on
  `!isTerminal(order.status) && order.status !== 'ready'` plus
  `booth?.vendor_id` — the connect button only makes sense while the order
  is still waiting), the resolved social links (`SocialLinksRow`,
  `@/components`, booth override else the vendor's shared default from
  `merqo.vendor_profile` via `getOrCreateVendorProfile` —
  `@/lib/merqo/vendor-profile` — degrading to booth-only links on any RPC
  error rather than breaking the page for a customer holding a valid, paid
  order link) pulled up next to the status/ETA block rather than the
  footer (a customer watches this page idle for several minutes; the
  engagement content belongs near what they're already looking at), `PayPanel`,
  the itemized order, then — only once `order.status === "completed"` (a
  mid-task feedback request is both more annoying and lower-quality than
  the same ask post-completion) — `FeedbackForm`, `EarnLink`, and a
  reorder/"order again" link. The big order-number heading is
  `order.order_number` by default, or (when the vendor's
  `board_settings.daily_order_number_reset` is on) a `displayOrderNumber`
  computed from a small extra read of that vendor's setting plus the booth's
  first order of the SGT day (`sgtStartOfDayIso`) — same display-only rule
  the vendor board applies, degrading silently to the real number on any
  read failure (decorative, never worth breaking the page over). `PayPanel`'s
  `orderRef` always stays the real, permanent number regardless — that one's
  for payment reconciliation, not display. A "Remember this number for
  pickup" line sits right under the heading, the first of several places
  (see `OrderStatusPoller` above) that re-anchor the order number to fight
  pickup mixups, per Manfred's first-event AAR. `resolveOrderDisplay` (one
  vendor `board_settings` read) also yields `pickupScanEnabled`; once
  `order.status === "ready"` and that flag is on, a `react-qr-code` QR
  encoding this same page's own URL renders after the itemized order
  ("Show this at the pickup counter to collect") — a vendor opts a booth
  into this via the dashboard settings "Self-checkout pickup" toggle, and a
  staff kiosk scans it into `../pickup`'s `confirmCollection`. The QR's
  origin comes from the request's own `host`/`x-forwarded-host` header
  (`resolveOrigin`), not an env var — `booth-qr-poster.tsx`'s design doc
  found `NEXT_PUBLIC_BASE_URL` unreliable, and this URL must resolve on a
  separate scanning device. Both headers are client-spoofable (same caution
  `clientIp` documents in `@/lib/rate-limit`), so `isAllowedHost` checks
  either against a `.merqo.io`/`.vercel.app`/localhost allowlist before it's
  trusted — `host` is preferred, `x-forwarded-host` only used as a fallback
  and only once it also passes the allowlist; neither matching degrades to
  the same hardcoded `https://qkit.example` placeholder. A basic check, not
  full trusted-proxy IP-range validation (a separate, bigger task).
- `page.dom.test.tsx` — RTL test rendering `OrderStatusPage` directly (same
  pattern as `src/app/dashboard/layout.dom.test.tsx`: an async Server
  Component page can be awaited and its returned tree rendered like any
  other component), with every nested async/side-effecting child
  (`OrderStatusPoller`, `EarnLink`, `next/dynamic`'s `PayPanel`) stubbed out
  so the test stays focused on `TelegramConnect`'s gating (renders while
  `status` is `pending`/`confirmed`/`preparing`, not once
  `ready`/`completed`/`cancelled`), the `../pay` redirect guard (fires
  only when `payment_status === "pending"`, `next/navigation`'s `redirect`
  mocked the same throw-to-abort way as `notFound`), the pickup QR
  (renders only when `status === "ready"` AND the mocked vendor row's
  `board_settings.pickup_scan_enabled` is `true`), and `resolveOrigin`'s
  host allowlist (`react-qr-code` mocked to expose its `value` prop as a
  `data-value` attribute so a test can assert the exact URL embedded — a
  trusted `host` or `x-forwarded-host` is used verbatim, an untrusted one
  in either header degrades to the `https://qkit.example` placeholder
  instead of ever being embedded, `next/headers`' `headers` mocked
  per-test via a shared `headersMock`).
- `pay-panel.tsx` — `PayPanel({ boothId, orderNumber, token, initialStatus })`
  client component: polls `getPaymentStatus` every 5s until
  `confirmed`/`not_required`. Renders only the states reachable once
  `page.tsx`'s redirect guard has ruled out `"pending"`: `not_required` →
  nothing, `confirmed` → a persistent "Payment confirmed" state, `claimed` →
  "Payment sent. The stall is checking it." with a "Tapped by
  mistake? Undo" button (`unclaimPayment`) — any other status renders
  nothing rather than throwing, defensively. The customer pays on
  paykit's own page, reached through `../pay`; nothing here claims.
- `pay-panel.dom.test.tsx` — RTL tests for the claimed/undo/confirmed/
  not-required states.
- `finalize-paid-order.ts` — **not** a `"use server"` file (same reason as
  `src/app/o/[code]/notify.ts`). `finalizePaidOrder(order, payment)` is the
  order half of a payment: assign the number (`qkit.assign_order_number`,
  which returns an existing one), alert the vendor, send the print job, write
  the `orders.payment_status` mirror last. Called by `loadPreClaimContext` here (the customer's return from
  paykit's pay page) and by the paykit callback route (`src/app/api/paykit/payment-status/route.ts`),
  usually for the same order at the same moment, so it is built to run twice:
  the vendor alert is sent only by the run the limiter allows
  (`paid-order-alert:<orderId>`, once per clock hour, the longest window the
  limiter's cleanup keeps), and the print job relies on
  printkit keeping one job per order. `writePaidMirror(supabase, orderId,
payment)` moves the mirror forward only (`claimed` never overwrites
  `confirmed`), sets `paid_at` on `confirmed`, and still records a screenshot
  when the order is already further along.
- `finalize-paid-order.test.ts` — the order of the steps, running twice in a
  row and at the same moment (one alert), a failed number assignment, each
  mirror rule, and the screenshot-only fallback.
- `payment-actions.ts` — service-client server actions: `getPaymentStatus`
  (read-only poll of the local `orders.payment_status` mirror — cheaper than
  round-tripping paykit every 5s; rate-limited per token, 30/60s — a holder
  of a valid token can't be brute-forced but could script polling past the
  page's own 5s cadence to amplify DB load), `loadPreClaimContext(boothId,
  token, origin)` (the pay step for a payment-required order that has no
  `order_number` yet; rate-limited per `boothId:token`, 20/60s, because it
  makes a real outbound `createCheckout` call to paykit on every invocation).
  It asks paykit for a checkout with `returnUrl` (`<origin>/order/<booth>/
  pay?t=<token>`) and the booth name as `title`, and answers `pay` (with
  paykit's `pay_url`), `placed` (the order already has a number, or paykit
  says the payment is claimed or confirmed, in which case it runs
  `finalizePaidOrder` itself so a customer who returns before paykit's
  callback still gets a number), `cancelled`, `expired` (checked before any
  checkout is created, so an expired order mints no pay link) or
  `unavailable` (paykit unreachable, refused the return address, gave no pay
  page, or numbering failed). A claimed order that never got its number is
  finished the same way. `origin` comes from `@/lib/request-origin`; paykit
  compares it with the origin registered for qkit, so a spoofed host gets a
  refusal, not a redirect. The claim itself (screenshot and "I've paid") now
  happens on paykit's page, so there is no `claimPayment`. `unclaimPayment` is unchanged (still `(boothId, orderNumber,
token)`, only ever runs post-claim when a number already exists): the
  "Tapped by mistake? Undo" companion, same rate-limit/lookup shape;
  finds the same paykit transaction through `transactionIdForOrder` (`@/lib/paykit/transaction-for-order`, which looks it up by the order's id) — there's no
  stored transaction id — then calls `unclaimCheckout`, idempotent on
  already-`pending` and refusing to revert a `confirmed` transaction, which
  paykit enforces itself and this mirrors with a fast local pre-check).
  paykit is authoritative for whether the claim/unclaim itself succeeded; a
  failed local mirror write still reports success to the customer.
- `payment-actions.test.ts` — unit tests for `loadPreClaimContext` (the
  return address and title sent to paykit, a long booth name cut to 120, each
  `unavailable` cause, a payment claimed or confirmed on paykit numbering the
  order with one vendor alert, a failed numbering changing nothing, the
  numbered, cancelled, expired and rate-limited branches), `unclaimPayment`
  and `getPaymentStatus`.
- `status-actions.ts` — `getOrderStatus(boothId, orderNumber, token)`:
  service-client read of just the `status` column, token-gated, used by the
  poller; rate-limited per token (30/60s, same load-amplification rationale
  as `getPaymentStatus` above); logs only real DB/network errors (an unknown
  order is a normal null). `confirmArrival(boothId, orderNumber, token)`: the customer-
  triggered arrival confirmation — flips the order from `'pending'` to
  `'preparing'`, starting prep. Refuses outright when the booth's own
  `requires_arrival_confirm` is off (a fresh read, not just the client's own
  copy) — a 'pending' order there is print-gated instead (migration 0086),
  and only the vendor's own board "Start now" tap may move it on; the
  customer can't self-accept an order the vendor didn't opt to let them.
  Token-gated and rate-limited exactly like
  `unclaimPayment` in `payment-actions.ts` (10/60s per IP+booth — small
  sequential order numbers are easy to enumerate); on a 0-row update it
  re-reads the order to distinguish a harmless double-tap (already started,
  e.g. the vendor hit "Start now" first — reported as success) from a real
  failure (still pending, cancelled, or missing). `getWaitEstimate(boothId, orderNumber, token)`: rate-limited per
  token (30/60s, same rationale as `getOrderStatus` — this one is the more
  expensive of the two, three reads not one, polled at the same cadence);
  returns
  `{ seconds, ordersAhead } | null` — `ordersAhead` (via `ordersAheadOf`) is
  always computable once the order exists and is unaffected by anything
  below; `seconds` is forced `null` outright when the vendor's
  `board_settings.show_wait_estimate` is off (default `true` — never a
  minute guess in that case, however much real history exists), otherwise
  computed via `estimateWaitSeconds` (the booth's recent completed-order
  average × `ordersAhead`), falling back to the vendor's `board_settings.
default_prep_minutes` (× 60 × `ordersAhead`) when there isn't enough recent
  history to trust the real average, and null only when neither is
  available. `null` for the whole result (not just `seconds`) means there's
  nothing to say at all (order not found).
- `status-actions.test.ts` — unit tests for `getOrderStatus`/`getWaitEstimate`
  (invalid token, no matching order, rate-limit denial before any DB read,
  a real read error) and `confirmArrival`'s arrival-gate/idempotent-double-tap
  behavior.

## Connectivity

Reached at `/order/{boothId}/{orderNumber}?t=<accessToken>` — the URL
`placeOrder` (in `src/app/o/[code]/actions.ts`) returns on success, and the
link `RecentOrders`/`ReorderButton` construct for a past order. A
payment-required order still `"pending"` is redirected to `../pay?t=
<accessToken>` instead (that route sends the customer on to paykit's pay page).
Past that gate, `page.tsx` composes `OrderStatusPoller` (polls
`status-actions.ts`) and `PayPanel` (polls/mutates via `payment-actions.ts`)
— both bypass RLS via the service client since the customer is anonymous and
the per-order `access_token` is the sole authorization. `payment-actions.ts`
calls out to paykit's checkout API (`@/lib/paykit/client`) for the claim/
unclaim transitions; `EarnLink` calls out to the separate LoopKit service,
and `TelegramConnect` calls out to merqo's `customer-connect-token`
endpoint (`@/lib/merqo/customer-notify`) — the first kit → merqo HTTP
direction in this codebase. `collect-actions.ts`'s `confirmCollection` is
called from `../pickup/pickup-scanner.tsx`, the self-checkout pickup kiosk
— a separate, public entry point that shares this same directory's
`access_token`-gated trust model but not its route.

## Shared package note

The payment screenshot no longer passes through qkit. paykit's pay page
resizes it in the browser, checks type and size, and stores it with the
transaction; qkit has no `resizeToWebp` call, no proof schema and no upload
action.

## Parent

[[boothId]](../README.md)
