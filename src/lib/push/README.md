# push

## Purpose

Web push for the customer's "your order is ready" alert. A locked phone or a
backgrounded tab suspends the status page, so its poll and local popup never
fire; a push reaches the service worker (`public/sw.js`) instead. Design:
`docs/superpowers/specs/2026-10-16-order-ready-web-push-design.md`.

## Contents

- `subscription.ts`: `pushSubscriptionSchema` (Zod shape of a browser
  `PushSubscription.toJSON()`) and `isAllowedPushEndpoint`, which accepts only
  the browsers' own push services (FCM, Mozilla, Windows, Apple), so a forged
  subscription cannot point the server at an arbitrary host.
- `subscription.test.ts`: allowlist and schema cases.
- `send.ts`: `sendOrderReadyPush(orderId)`, server-only. Reads the order's
  `order_push_subscriptions` rows (service-role only, migration 0105) and sends
  each its stored payload through `web-push` (TTL one hour, high urgency).
  Deletes a row on 404/410, logs any other failure, never throws, and does
  nothing without the VAPID env vars. Called through `after()` from
  `advanceOrder`'s ready transition.
- `send.test.ts`: no-op without keys, payload and options, cleanup on 404/410,
  never-throws.
- `client.ts`: `subscribeToPush()` for the status page. Reuses or creates the
  browser's subscription with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; returns null
  wherever push is unavailable. Never prompts for permission itself.
- `client.test.ts`: jsdom tests for the subscribe, reuse and null paths.
- `sw-push.test.ts`: runs `public/sw.js` in a sandbox and checks its `push`
  handler.
