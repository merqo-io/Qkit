# Order-ready web push

Date: 2026-10-16
Status: approved (user, via the qkit issues session: "skip it" on the iPhone
hint, rest as proposed)

## Why

Cassie took orders at a pilot event and found that customers do not know their
order is ready unless the status page is open and in front of them. Today the
status page polls and, on the `ready` transition, shows a local notification
(`registration.showNotification` from the page) and plays a chime. A locked
phone or a backgrounded tab suspends the page, so the poll never sees `ready`
and nothing fires. The opt-in Telegram ping helps only customers who connect
Telegram. SMS was rejected on cost (no paid per-message channel).

Web push is free: the vendor's server sends a message to the browser's push
service (FCM, Mozilla, Apple, Microsoft) and the service worker shows the
notification even when the page is not running.

The 2026-06-21 sound-and-notifications spec deliberately left out Push API and
VAPID. This spec adds them.

## Goals

- A customer who tapped "Alert me when it's ready" and allowed notifications
  gets a system notification when the vendor marks the order ready, with the
  phone locked or the tab in the background (Android Chrome, desktop Chrome,
  Firefox, Edge; iOS only inside an installed home-screen web app, which we
  do not promote).
- The vendor's Mark Ready (single or "Mark all ready") is never slowed or
  failed by push.
- One alert, not two, when the tab is open and visible as well.

## Non-goals

- No iPhone "Add to Home Screen" hint and no install nudge of any kind (user
  decision: "i dont see a need to"). iPhone customers keep the chime and
  Telegram.
- No push for other transitions (confirmed, preparing, cancelled). Only ready.
- No vendor-side push (the vendor board has its own alerts).
- No SMS, WhatsApp or any paid per-message channel.

## Anti-goals

- Push failures surfacing to the vendor or changing `advanceOrder`'s result.
- Anyone other than the order's own holder registering a subscription for it,
  or reading another order's subscriptions.
- Our server POSTing to arbitrary URLs a client supplies (the push endpoint is
  client-supplied, so it is an SSRF vector if unchecked).

## Design

### Keys (env vars)

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: the VAPID public key (base64url). Public by
  design: the browser needs it as `applicationServerKey`. Inlined at build.
- `VAPID_PRIVATE_KEY`: server-only. Signs push requests.
- `VAPID_SUBJECT`: server-only, a `mailto:` or `https:` contact the push
  services can reach.

Unset keys mean push is off: the page does not subscribe and the sender does
nothing. Local dev and tests work without them.

Generate once with `pnpm dlx web-push generate-vapid-keys`.

### Storage: `qkit.order_push_subscriptions` (migration 0105)

| column       | type        | notes                                          |
| ------------ | ----------- | ---------------------------------------------- |
| `id`         | uuid pk     |                                                |
| `order_id`   | uuid        | FK `qkit.orders(id)` ON DELETE CASCADE         |
| `endpoint`   | text        | push service URL; unique with `order_id`       |
| `p256dh`     | text        | subscription key                               |
| `auth`       | text        | subscription secret                            |
| `title`      | text        | notification title, computed server-side       |
| `body`       | text        | notification body, computed server-side        |
| `url`        | text        | relative status-page path incl. `?t=` token    |
| `tag`        | text        | notification tag, same as the page's own popup |
| `created_at` | timestamptz |                                                |

- RLS enabled with **no policies**; `REVOKE ALL` from `anon` and
  `authenticated`. Only the service-role client reads or writes it, from
  server actions.
- The notification text and URL are computed by the server when the customer
  subscribes (it holds the token and resolves the daily display number with
  the same helper as the page), so the send path never needs the order's
  access token and never trusts client text.
- Rows go away when no longer useful:
  - an `AFTER UPDATE OF status` trigger on `qkit.orders` deletes the order's
    rows when it becomes `completed` or `cancelled` (covers vendor taps, the
    auto-clear sweep and the SQL stale-order sweep alike);
  - the sender deletes a row when the push service answers 404 or 410;
  - order deletion cascades.

### Subscribe (customer status page)

- Reuses the existing "Alert me when it's ready" tap. After permission comes
  back `granted`, the page (best-effort, silent on failure) gets the service
  worker registration, calls `pushManager.subscribe({ userVisibleOnly: true,
applicationServerKey })` (reusing an existing subscription), and sends it to
  a new server action `savePushSubscription(boothId, orderNumber, token,
subscription)`.
- A customer who already granted permission on an earlier visit (button hidden)
  is also subscribed on page load, while the order is still waiting.
- The UI is unchanged: no new copy, no new button. The "We'll alert you" line
  is already honest for Android and desktop.

`savePushSubscription`:

- Zod-validates the order ref and the subscription (`endpoint` https URL on an
  allowlisted push host, `keys.p256dh` and `keys.auth` base64url with length
  caps).
- Rate-limited per token.
- Looks up the order by booth, number and access token with the service
  client; refuses terminal orders.
- Caps subscriptions per order (5) and upserts on `(order_id, endpoint)`.

Allowlisted push hosts: `fcm.googleapis.com`, `*.push.services.mozilla.com`,
`*.notify.windows.com`, `*.push.apple.com`. Anything else is rejected.

### Service worker

`/sw.js` gains a `push` handler: parse the JSON payload `{title, body, url,
tag}` and call `showNotification` with `data: {url}`. The existing
`notificationclick` handler (already origin-checked) opens or focuses the
order page. Malformed payloads show nothing.

The push payload's `tag` is `qkit-order-<display number>`, the same tag
`fireReadyNotification` uses, so an open tab and the push coalesce into one
notification.

### Send

`sendOrderReadyPush(orderId)` in `src/lib/push/send.ts`, server-only:

- No-op when VAPID env vars are unset.
- Reads the order's subscriptions with the service client and sends each
  through the `web-push` library with a short TTL (one hour) and `urgency:
high`.
- On 404 or 410 deletes that row. Any other error is logged.
- Never throws.

Called from `advanceOrder`'s `ready` branch in
`src/app/dashboard/order-actions.ts` through Next's `after()`, so it runs once
the vendor's response is sent and Mark Ready (or "Mark all ready") is never
slowed by the push services. The scheduling is wrapped so nothing changes the
action's result. It is **not** gated by the vendor's
`customer_telegram_notify_enabled` switch: that switch is labelled for
Telegram, and the customer opted in to push from their own browser, the same
as the page's own popup, which no vendor setting gates either. `advanceOrder` is the only path to `ready`: "Mark all ready"
(`board-batch.tsx`) calls it per order, and no sweep or SQL path moves an order
to `ready`. Restoring an auto-completed order back to `ready` does not push
(not a fresh ready, and its subscriptions were already deleted).

## Builder's calls (made, not agreed)

- Library: `web-push` (plus `@types/web-push`), the standard Node
  implementation of VAPID and payload encryption.
- No vendor gate on push (see Send). The playback proposed reusing the
  Telegram switch; changed during the build because that switch is labelled
  for Telegram only.
- Sending through `after()` instead of awaiting inside the action.
- Payload computed at subscribe time rather than send time.
- Trigger-based cleanup rather than app-code cleanup.

## Testing

- Unit (`src/lib/push/*.test.ts`): subscription schema and host allowlist;
  sender no-op without keys, sends to every row, deletes on 404/410, logs and
  keeps on other errors, never throws.
- Server action tests: rejects bad ref or token, terminal order, foreign
  host, cap reached; upserts on success.
- `advanceOrder` test: push scheduled on ready and only on ready, not
  awaited, still sent when the Telegram switch is off, and a throwing
  scheduler does not change the result.
- Service worker: `sw-push.test.ts` runs `public/sw.js` in a sandbox.
- RTL: the poller subscribes after granting permission and on load when
  already granted; does nothing when unsupported or without the public key;
  a subscribe failure leaves the button flow intact.
- RLS (pgTAP): anon and authenticated cannot select or insert.

## Rollout

1. Apply migration `0105_order_push_subscriptions.sql` (user applies by hand).
2. Add the three env vars on Vercel (Production and Preview), then redeploy
   (the public key is inlined at build).
