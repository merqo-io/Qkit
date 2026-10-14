# board

## Purpose

The vendor's order ticket and what hangs off it: the status badge and the
payment-proof viewer. Rendered by the live order board and by the
completed-orders history.

## Contents

- `order-card.dom.test.tsx` — RTL tests for `OrderCard`'s status/payment
  transitions, action-button wiring, the `displayNumber` override, the
  walk-up origin badge, the batch-select checkbox, and the reconciled "Mark
  paid & start" review action — the merged button (not two) for a pending
  order with an outstanding payment claim, on both a QR and a walk-up order,
  the plain Start-now button once payment is already settled, and that
  tapping/undoing it calls `confirmPaymentAndStart`/`revertPaymentAndStart`.
- `order-card-parts.tsx` — the pieces `OrderCard` is assembled from, moved
  out of `order-card.tsx` unchanged: `TicketMenu` (the "more" menu),
  `TicketItems`, `TicketActions` (the action row and its Undo), the
  proof-photo trigger and the `PendingUndo` type.
- `order-card.tsx` — `OrderCard`, the vendor's order ticket, laid out for
  reading at a counter: the number (largest, last digit in the accent colour)
  and the customer's name, one line of always-visible options per item (the
  vendor's short codes via `optionCodes` where set, see `@/lib/ticket`), a
  single `AttentionLine` chosen by `ticketAttention` in place of stacked
  badges, and one next-step button (`TicketActions`). Bump and cancel sit in
  a `TicketMenu` dropdown; "Preparing" and "Paid" go unstated. `showDate`
  switches on the history view: date and time, per-line prices and the
  total, none of which the live board shows. The notes below predate this
  layout and describe behaviour that is unchanged (undo, payment review,
  auto-clear, batch select). Signature: `OrderCard({ order, displayNumber,
  overtaken, optionCodes, boothName, agingMin,
overdueMin, onUndoWindowChange, showDate, undoMs, readyAutoClearMs, selectable,
selected, onToggleSelect })`. Item options start expanded, not collapsed behind
  "Show options": whoever writes the order onto a cup needs every
  customisation, and a collapsed card cost one tap per order, over a hundred in
  a service. The toggle remains, for a vendor scanning numbers rather than
  making drinks. The customer name and item names wrap rather than truncate,
  since a cut-off name is what gets written on the cup and called out. A
  walk-up order is tagged "· walk-up" beside the name (no phone to notify, so
  staff call it), except one keyed in without a name: that is saved as
  "Walk-up", and the tag would print the word twice (`showsWalkupTag`). With
  `overtaken` (from `overtakenOrderIds` in `@/lib/orders`, set by the board) the
  card carries a "Passed over" badge: a later order from the same booth is
  already out, so this one was probably finished without anyone marking it. The
  rest: the
  vendor dashboard's live order ticket — status/payment badges (plus a
  "Print failed" badge, `PrintBadge`, when `order.print_status === "failed"`
  — silent for `queued`/`sent`/`printed`/`not_required`, set via printkit's
  `POST /api/printkit/print-status` callback — and a
  "Walk-up" badge when `order.source === "walkup"`, staff-entered orders vs.
  the default QR-placed ones — `PaymentBadge`/`PrintBadge`/the inline
  walk-up pill all render through one local `MiniPill({label, className})`,
  since all three shared the identical pill class fingerprint before this
  extraction), an aging
  clock (`orderAgeTone`, ticks every 30s) moved to the footer beside the
  arrival timestamp (`sgtClock`, bare time — or `shortDateTime`, date+time,
  when `showDate` is set, for the completed-orders history list where every
  card isn't from today), expandable item options, and the advance/cancel/
  confirm-payment action buttons wired to `@/app/dashboard/order-actions`. A
  still-`pending` order with an outstanding payment claim (`payment_status`
  not `confirmed`/`not_required` — keyed on order state via `needsPaymentReview`
  in `@/lib/orders`, not `order.source`, so an unpaid walk-up order gets it
  too) collapses the separate confirm-payment and Start-now buttons into one
  "Mark paid & start" tap (`confirmPaymentAndStart`) — there's no real
  scenario where a vendor confirms payment without also starting the order.
  Its undo (within the same `undoMs` window as every other advance) calls the
  dedicated `revertPaymentAndStart`; both undo actions preserve confirmed
  payments. The card's `pendingUndo` state carries an `action:
"advance" | "paymentAndStart"` tag so its one undo button dispatches to
  whichever action made the original change.
  Pickup never confirms payment. Completed unpaid orders retain an explicit
  Paykit-backed settlement action and proof review; cancelled orders do not.
  Advancing (Mark Ready/Mark Picked Up) fires instantly — no confirm gate on
  a tapped-dozens-of-times-a-shift button — backed instead by an `undoMs`
  (default `DEFAULT_UNDO_MS`, 4s; vendor-configurable via
  `board_settings.undo_seconds * 1000`) undo window: the button becomes an
  Undo affordance with a left-to-right drain (`.undo-bar` in `globals.css`,
  duration set inline to match `undoMs`), and `onUndoWindowChange(orderId,
  active)` tells the board to keep a just-completed (terminal) order on the
  active grid for that window, since the realtime echo of the very write
  being offered for undo would otherwise filter the card off the board
  first. While `status === "ready"` and `readyAutoClearMs` is set
  (`board_settings.ready_auto_clear_min * 60_000`, vendor-configurable,
  `null` when the vendor hasn't turned auto-clear on), "Mark Picked Up"
  shows the same left-to-right drain (`.autoclear-bar`, reusing `.undo-bar`'s
  `undo-drain` keyframe) for the time left before `sweepReadyOrders`
  auto-completes it — set once (in an effect keyed on `ready_at`/`status`/
  `readyAutoClearMs`, not recomputed every poll tick) so it drains smoothly
  from a fixed duration instead of restarting on every re-render; purely
  display, the actual clearing stays server-side. `displayNumber` (optional,
  board_settings.daily_order_number_reset
  — see `displayOrderNumber` in `@/lib/orders`) overrides what's shown/
  referenced everywhere the card names "this order" by number — the
  name/number block itself, and its own cancel confirm dialog — falling back
  to the real `order.order_number` when omitted (every call site except the
  live board itself, e.g. the completed-orders history list, which
  intentionally always shows the real, permanent number). The shown number's
  trailing digit is emphasized in its own `<span>` (`splitTrailingDigit` in
  `@/lib/orders`) so a vendor using a physical pickup-shelf-slot system
  (bubble-tea-chain style — slotting an order by its last digit) can read it
  at a glance. The name/number block sits beside a dedicated bump icon chip
  — an instant tap, no confirm dialog (2026-09-15 — dropped the dialog to
  match `advanceStatus`'s own instant-tap rationale below: a mis-bump has no
  real consequence, just an order prepped slightly out of its natural order),
  disabled once already bumped.
  In multi-booth view, a full-width banner above the header shows the booth
  name next to a `boothColor()` dot. One "attention wash" background at a
  time, prioritized overdue > payment-claimed > aging. The footer's elapsed
  "Nm" label and the aging tone come from `useNow`, which is `null` until
  mount, so the card SSRs with no label and a "fresh" tone and fills both in on
  the client (no hydration text mismatch). A closed card whose
  `order.auto_completed` is true (the ready-order auto-clear sweep, not a
  vendor's own "Mark Picked Up" tap, completed it) shows a "Restore to
  ready" button calling `restoreAutoCompleted` — this is where the
  completed-orders history list's undo for a premature auto-clear lives —
  alongside a Cancel option (hidden once payment is confirmed, same as the
  live Cancel button) calling the same `cancelOrder`, since the sweep can
  beat a vendor's own cancel tap to it and the only other way to actually
  cancel that order would be restoring it to ready first. `selectable` (set
  by the board only for `preparing` orders while its own batch mark-ready
  mode is on) renders a `Checkbox` (`selected`, `onToggleSelect(order.id)`)
  next to the name/number block — selection state and the bulk `advanceOrder`
  call itself live on `RealtimeOrderBoard`, not here. A non-cancelled order
  with `payment_status === "claimed"` and an uploaded proof photo also shows
  a dashed "View payment proof" toggle (`ProofPhotoTrigger`, local to this
  file) that lazily mounts `PaymentProofViewer` (`./payment-proof-viewer.tsx`,
  `next/dynamic`) only once expanded, so the OCR worker never loads for a
  card the vendor hasn't opened.
- `order-status-badge.tsx` — `OrderStatusBadge({ status })`: a colour-coded
  pill for each `OrderStatus` (pending/confirmed/preparing/ready/completed/
  cancelled), shared by the dashboard board and the customer status page.
  Thin wrapper around `@merqo/ui`'s shared `StatusBadge` (extracted from this
  file, the chosen design target over other kits' plain shadcn `Badge` uses)
  — keeps qkit's own `STATUS_CONFIG` label/colour map, passed through as the
  `config` prop; same rendered markup as before.
- `payment-proof-viewer.dom.test.tsx` — RTL tests for `PaymentProofViewer`:
  the photo, no hint when paykit reports none, the amount-match and
  could-not-confirm hints, both duplicate warnings (a numbered order, with
  its day when it is from an earlier day, or "another payment"), "No payment
  screenshot on file", a failing action, and
  that one order's photo is never shown under another. `getOrderPaymentProof`
  is mocked.
- `payment-proof-viewer.tsx` — `PaymentProofViewer({ orderId,
expectedAmountCents })`: `"use client"`, dynamically imported
  (`order-card-parts.tsx`'s `ProofPhotoTrigger`) so it loads only for a card
  the vendor opens. On mount it makes one call, `getOrderPaymentProof`
  (`@/app/dashboard/payment-evidence-actions`), which answers from paykit, or
  from qkit's own bucket for an order claimed before screenshots moved.
  Renders nothing until it answers, then the photo plus a duplicate warning
  ("This photo was already used for order #N", where N is the number on that
  order's board card, plus "on 1 Oct" when the order is from an earlier day;
  or "for another payment" when paykit names one this board cannot), or "No
  payment screenshot on file"
  when there is none. The amount hint ("Amount matches $X.XX. Verify payment
  in your payment app." or "Couldn't confirm the amount, check manually") is
  paykit's reading: paykit reads the photo on its server just after the
  claim. When paykit has no reading (the photo could not be read, or an
  order from before the move) no amount hint is shown. Nothing in qkit reads
  the photo: there is no OCR, no worker and no Tesseract here any more. Both
  hints only inform the vendor's own check and never confirm a payment.

## Parent

[components](../README.md)

`order-card-parts.tsx` shows "View payment proof" for every claimed, non-cancelled order. It no longer looks at `order.payment_proof_path`: paykit holds the screenshot, so the order row cannot say whether one exists and the viewer finds out when opened.
