# settings

## Purpose

Lets a vendor tune how their live order board gets their attention and what
customers see while they wait: the amber/red aging thresholds, how long
staff have to undo a tap, how long an uncollected ready order sits before
auto-clearing, whether the customer Telegram "order ready" ping is on for
this vendor, the new-order sound, desktop notifications, whether order
numbers reset daily, whether a wait-time estimate shows at all, a
backup prep-time estimate, and whether the order-status page shows a
pickup QR once an order is `ready` (self-checkout, opt-in). Settings are
stored on the vendor's own row and
sync across devices. The "Connect Telegram" section that used to live here
(a one-time deep-link QR against qkit's own Telegram bot) was retired
2026-08-16 in favor of merqo's shared bot — a vendor now connects once via
merqo's own `/profile` page instead; see
`docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.

## Contents

- `actions.ts` — `updateBoardSettings(input)` server action: validates
  `input` against `boardSettingsPatchSchema`, confirms the caller is signed in,
  then atomically merges section-owned fields through `patch_board_settings`
  under the caller's vendor RLS policies and revalidates `/dashboard`.
- `page.tsx` — `SettingsPage` server component. Calls `requireEntitledVendor()`,
  renders the header/back-button chrome, and passes `vendor.board_settings` as
  `initial` into `SettingsForm`. Also fetches the vendor's booth ids and its
  last 20 `completed` orders across all of them (same window size as
  `getWaitEstimate`'s `RECENT_ORDER_LIMIT` in
  `src/app/order/[boothId]/[orderNumber]/status-actions.ts`, but combined
  across every booth rather than one — a vendor-wide approximation matching
  `default_prep_minutes`'s own vendor-wide granularity), reduces that through
  `currentPrepEstimate` (`@/lib/stats`), and passes the result as
  `prepEstimate`. `revalidate = 0` (always fresh).
- `settings-form.tsx` — `SettingsForm({ initial, prepEstimate })` client
  component, the actual UI. Every switch saves the moment it is flipped
  (`saveSwitch`, one key per call, flipped back if the save is refused), as
  the sound and notification choices do; the two Save buttons cover only the
  number fields, which have half-typed states worth holding back. Every (i) hint is an `InfoTooltip` with
  `trigger="tap"`: this form is filled in on iPads and phones, where a
  hover-only tooltip never opens. Each has its own accessible name ("About
  the amber threshold", not nine copies of "More about this setting"), worded
  so it does not contain the field's own label. The Notifications section's
  iPhone/iPad note is a `Hint` beside its switch, not `Section`'s `tooltip`
  (a hover tooltip rendered by `@merqo/ui`, which is exactly what its
  intended readers cannot open). Four `Section` cards (from `ticket-section.tsx`)
  split across `@merqo/ui`'s `TwoColumnSections` (`columnOne`/`columnTwo`
  props, each an independent `flex flex-col gap-5` stack side by side on
  `md`+ — the same shared component `../profile/profile-form.tsx` uses) —
  "Board timing" + "Notifications" in `columnOne`, "New-order sound" +
  "Customer order screen" in `columnTwo`. Deliberately not a single `md:grid
md:grid-cols-2` over all four: a CSS grid's row tracks size to the tallest
  cell in that row, so once "Board timing" (4 inputs) outgrew "New-order
  sound" (1 button row), row 2 started late in _both_ columns — a visible gap
  over "Customer order screen" that had nothing to do with its own content.
  Nor CSS multi-column `columns` (the layout before that), which packs
  tightly but lets a card's visual position drift from its actual reading
  order. Every field/switch across all four cards follows the same
  short-label-plus-(i) shape: a one- or two-word `Label`/caption next to an
  `InfoTooltip` (`@merqo/ui` — the shared (i)-trigger component every
  one-sentence-explanation spot in the app uses, also used by `Section`'s
  own header `tooltip` prop) carrying the one-sentence explanation, so no
  card leans on a long inline paragraph to explain a single control. "Board timing" holds "Turn amber
  after"/"Turn red after" (the aging/overdue minute thresholds), "Undo
  window" (`undo_seconds`, 2-15s, validated live via `boardSettingsSchema`),
  "Auto-clear after" (`ready_auto_clear_min`, 1-60min, blank/empty =
  `null` = the auto-clear sweep is off for that vendor entirely — see
  `sweepReadyOrders` in `src/app/dashboard/order-actions.ts`), and (2026-08-16,
  directly below Auto-clear after, same "Save timing" submit) a `Switch`
  labeled "Notify customers on Telegram when their order is ready" for
  `customer_telegram_notify_enabled` — defaults checked (`?? true` on read,
  covering a legacy vendor row whose stored `board_settings` predates this
  key, same rationale as `boardSettingsSchema`'s own `.default(true)`); this
  is a vendor-side opt-out layered on the customer's own already-given
  consent (merqo's connect flow), not a re-ask — see `customerNotifyEnabled`
  in `src/app/dashboard/order-actions.ts`; directly below it, a `Switch`
  labeled "Self-checkout pickup" for `pickup_scan_enabled` (default `false`,
  copied from the customer-notify switch above) — gates the pickup QR on
  `src/app/order/[boothId]/[orderNumber]/page.tsx`'s order-status page; "New-order
  sound" is a `ToggleGroup` of `SOUND_OPTIONS` —
  chime/bell/ding/horn/triple/off — that previews via `playSound` on pick and
  saves immediately; "Notifications" is a `Switch` (its extra iOS/Android
  detail lives behind the `Section`'s own `tooltip` prop, next to the card
  title, rather than in the always-visible `description`) that unlocks audio
  - requests `Notification` permission via `@/lib/order-alerts` before saving
    `desktop_notify`, reverting on denial. `desktop_notify` (the account
    setting, synced across devices) and the browser's own permission are
    tracked separately (`permission` state, updated only by this component's
    own request calls, never re-read live) — when the switch is already on but
    this browser hasn't granted it (e.g. after syncing from another device),
    clicking the switch would just turn it off, so a standalone "Enable in
    this browser" button re-requests permission without touching the account
    setting. "Customer order screen" has three controls: a `Switch` labeled
    "Simple daily order number" for `daily_order_number_reset` (see
    `displayOrderNumber` in `@/lib/orders` — zero-padded to 3 digits, e.g.
    "#003"); a `Switch` labeled "Show wait-time estimate" for
    `show_wait_estimate` (default `true` — off means the status page always
    shows only the queue-position label, "N orders ahead of you", never a
    minute guess, regardless of how much real order history exists — see
    `getWaitEstimate` in `status-actions.ts`); and a 1-60min "Backup prep
    time" `default_prep_minutes` number input, blank = null = "just show queue
    position" — used by the customer status page's wait estimate only when
    there isn't enough of today's history yet (`estimateWaitSeconds` in
    `@/lib/stats`). The backup-prep-time input is `disabled` and its block
    dimmed (`opacity-50`) whenever `show_wait_estimate` is off, since it
    would have no effect on what the customer sees in that state. Directly
    under that input (when the estimate is on), `prepEstimate` renders
    either the live number this vendor's own recent orders would currently
    produce ("Live right now: ~N min per order…", meaning the backup isn't
    in use) or, below the sample-size threshold, a disclaimer naming
    whichever fallback a customer would actually see right now — "their
    queue position" if `default_prep_minutes` is blank, "this backup
    number" once one's set — so the field doesn't read as inert when
    there's nothing to back up yet. Each section calls `updateBoardSettings` independently through `useAsyncAction`
    and refreshes on success. It sends only its section-owned fields; the atomic
    database patch preserves fields saved by other tabs or devices.
- `settings-form.dom.test.tsx` — RTL/jsdom tests (no local `TooltipProvider`
  needed — the per-field info tooltips come from `@merqo/ui`'s
  `InfoTooltip`, which wraps itself internally — with a `prepEstimate` prop
  supplied on every render): rejects `overdue_min <=
aging_min` and an out-of-range `undo_seconds` client-side without calling
  the action, saves valid thresholds, a changed undo window, and a changed
  `ready_auto_clear_min` value, previews+saves a sound pick, covers both
  notification-permission branches (granted saves and enables; denied
  reverts the switch and shows an error) plus the already-on-but-not-granted
  "Enable in this browser" path (re-requests permission without calling
  `updateBoardSettings`), hydration with a browser answer the server could
  not know (no recoverable error), and the customer-order-screen section (saves the
  daily-reset toggle, saves the show-wait-estimate toggle and confirms the
  backup-prep-time input disables while it's off, saves a configured backup
  prep time, saves `null` when it's cleared, rejects an out-of-1-60-range
  value without calling the action, and the three `prepEstimate` states:
  not-enough-history naming the
  queue-position fallback, naming the backup number once one's set, and (2026-08-16)
  the customer-notify toggle (renders checked by default and saves
  `customer_telegram_notify_enabled: false` via "Save timing" once toggled
  off; still renders checked when `initial` is a legacy `BoardSettings`
  object with the key stripped out entirely, simulating a vendor row stored
  before this key existed), the pickup-scan toggle (saves
  `pickup_scan_enabled: true` via "Save timing" once toggled), and the
  live-estimate line once enough history exists) — all with
  `updateBoardSettings`/`sonner`/`order-alerts` mocked.

## Connectivity

`page.tsx` is the route entry (`/dashboard/settings`), reached from the
dashboard nav; it fetches the vendor row via `requireEntitledVendor` and hands
it to `SettingsForm`. `SettingsForm` calls `actions.ts#updateBoardSettings`,
which validates a strict partial patch and calls the invoker `patch_board_settings`
RPC (migration 0096). Each section sends only its owned fields; the database
locks the vendor row, validates the merged timing constraints and merges the JSON,
so saves from stale tabs preserve other sections. Existing vendor RLS remains
the authorization boundary. Configured async form handlers also show transport
failures and keep entered values available for retry. The action revalidates the
`/dashboard` layout so the
order board (`src/app/dashboard`) and the customer status page
(`src/app/order/[boothId]/[orderNumber]`) pick up the new settings on next
render — `OrderCard` reads `agingMin`/`overdueMin`/`undoMs` (the last as
`undo_seconds * 1000`), the dashboard's realtime listener plays the chosen
sound / fires notifications, `daily_order_number_reset` feeds
`displayOrderNumber` on both the board and the status page,
`default_prep_minutes` feeds `getWaitEstimate`'s fallback and
`show_wait_estimate` gates whether it returns a number at all
(`src/app/order/[boothId]/[orderNumber]/status-actions.ts`), and
`ready_auto_clear_min` gates the board's 30s `sweepReadyOrders` poll
(`realtime-order-board.tsx` in `src/app/dashboard`) — `null` (the field left
blank here) disables the sweep entirely for that vendor, and
`pickup_scan_enabled` gates whether the order-status page renders the
pickup QR once `status === "ready"`.

## Parent

[dashboard](../README.md)
