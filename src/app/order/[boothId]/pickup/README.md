# pickup

## Purpose

Public, unattended self-checkout pickup kiosk. Answers Manfred's first-event
AAR pain point #3 (pickup mix-ups at handoff) with a mechanic modeled on
real self-checkout retail (Amazon Go/Luckin Coffee): a tablet sits at the
pickup shelf running `/order/{boothId}/pickup`, a commodity Bluetooth
**HID** (keyboard-emulating) barcode/QR scanner is paired to it once via the
OS, and the customer holds up their own order-status page (which shows a QR
only once the order is `ready`) to the scanner. No printed cup label, no
camera UI, no login — the scanner types the decoded URL plus an Enter
keystroke into whatever has focus, and this page keeps a single text input
focused at all times to receive it. See
`docs/superpowers/specs/2026-09-13-payment-first-checkout-and-self-checkout-pickup-design.md`'s
"Pickup mechanic: self-checkout kiosk" section for the full v1-v5 rationale.

**Explicit non-security-boundary framing:** `confirmCollection` (the server
action this page calls, `../[orderNumber]/collect-actions.ts`) is authorized
purely by the token embedded in the scanned URL — the exact same trust
level every other customer order action in this app already has (claim/
unclaim payment, arrival confirm). The kiosk's physical presence at the
pickup shelf is a workflow nicety (this is where staff choose to put the
tablet), not something the server enforces; anyone who obtained the token
by another means could call the same action from anywhere. This page adds
no new authorization boundary, and the design doc says so outright so it's
never mistaken for one.

## Contents

- `page.tsx` — `PickupPage` (route entry, `revalidate=0`): validates
  `boothId` as a UUID (`notFound()` otherwise, same gate as `../display/
page.tsx`), then renders `PickupScanner`. No booth-existence read (unlike
  `../display/page.tsx`) — an unknown-but-well-formed booth id just shows an
  idle scanner that will fail every scan at the `confirmCollection` layer,
  which is enough since this page has no vendor-facing content to protect.
- `page.dom.test.tsx` — RTL test rendering `PickupPage` directly, with
  `PickupScanner` stubbed (own dedicated test file): the `notFound()` branch
  for an invalid booth id, and that a valid one renders the scanner with the
  booth id passed through.
- `pickup-scanner.tsx` — `PickupScanner({ boothId })` client component: a
  single auto-focused text input (re-focused on blur, since nothing else on
  this page should ever hold focus) that parses an Enter-terminated scan via
  a local `parseScan` (extracts `boothId`/`orderNumber`/`token` from the
  order-status page's own URL shape, `/order/{boothId}/{orderNumber}
?t=token`) and, only for a well-formed scan matching this page's own
  `boothId` (a mismatch shows "Wrong stall" without ever calling the
  server), calls `confirmCollection` (`../[orderNumber]/collect-actions.ts`).
  The input is genuinely `disabled` (not just visually suppressed) from the
  Enter keystroke until that call resolves, so a rapid second scan's
  keystrokes can never land mid-request and corrupt the parse — cleared and
  re-focused only once the result (success or a specific failure message)
  is flashed beneath the input.
- `pickup-scanner.dom.test.tsx` — RTL tests for the auto-focus-on-mount, a
  well-formed same-booth scan (calls `confirmCollection`, flashes "Order #N
  collected", clears the input), a different-booth scan (never calls the
  server, flashes "Wrong stall"), the input staying disabled for the
  duration of an in-flight call and re-enabling once it resolves, and an
  unparseable scan (flashes "Couldn't read that scan").

## Connectivity

Reached by whoever mounts the tablet at the pickup shelf, typed at by a
paired Bluetooth HID scanner — no in-app link points here (it's set up
once, out of band, not navigated to from any button). Calls
`confirmCollection` in `../[orderNumber]/collect-actions.ts`, which flips
the scanned order from `ready` to `completed` (via `buildAdvancePatch` and
`recordOrderStatusEvent`, `actor: null` since there's no authenticated
user) — the same terminal transition the vendor board's own "Mark Picked
Up" button (`ADVANCE.ready`, `@/lib/orders`) already performs, just reached
from the customer side instead of the vendor's. This page and
`collect-actions.ts` only consume the order-status page's existing URL
shape (`/order/{boothId}/{orderNumber}?t=token`) — neither renders
anything on that page itself. The order-status page renders the pickup QR once `order.status === "ready"`
and the booth's own `pickup_scan_enabled` column is on (migration 0104;
before 2026-10-16 it was one vendor-wide `board_settings` key). Collection changes fulfillment
only; it never confirms or clears payment. The vendor's board remains the
manual collection fallback.

## Parent

[[boothId]](../README.md)
