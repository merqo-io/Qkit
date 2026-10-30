# Changelog

## Unreleased: multi-drink label batches

- Expand eligible persisted item quantities into bounded Printkit label batches after the existing Start/payment gates, with explicit handling for empty and invalid snapshots. Requires Printkit migration 0011 and physical staging verification.

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-10-29

### Fixed

- Daily ticket numbers keep their numeric baseline when the lifetime counter crosses 9,999; lost-response checkout errors now explain that the order may already exist and must be recovered with the same details.
- Labels wait for confirmed payment on payment orders, and vendor Start on non-payment orders. Printing-enabled QR and walk-up orders no longer automatically start; customer arrival leaves them awaiting vendor Start. Requires owner-applied migration `0107`.

### Added

- `qkit.ops_events` failure log (migration `0108`, service-role only, purged after 30 days). Rejected paykit callbacks are recorded as `webhook_rejected` (`signature_invalid`, `transaction_missing`, `transaction_mismatch`) and generic order-board action failures as `action_error` (code = action name). `GET /api/merqo/vendor-activity` now returns `incidents` and `recent` for the last 72 hours. Requires owner-applied migration `0108`.
- NCS November 6 readiness checklist covering shared-number incident capture, retries, venue Wi-Fi, a 200-cup rehearsal and the Ops lead handoff.

## [0.2.0] - 2026-10-24

### Security

- Nonce-based CSP (`script-src` without `unsafe-inline`) on every page, set in `proxy.ts` from `@merqo/ui/security`. Every page already rendered per request, so none stays on the static policy. The `@merqo/ui` pin moves to v0.35.0 and next-themes receives the nonce.
- `X-Robots-Tag: noindex, nofollow` and a disallow-all `robots.txt` on every non-production deployment.
- Admin pages and actions now require a verified TOTP second factor (`aal2`); a password-only admin session is redirected to the new `/mfa` page.
- Duplicate host-only auth cookies are cleared on every request instead of once behind a marker (a re-created duplicate sent vendors to /login).
- The CSP allows the Vercel toolbar origin outside production. In the nonce policy the toolbar script itself stays blocked (`strict-dynamic` ignores host allow-lists), so turn the toolbar off for preview in Vercel.
- Zod parsing for the auth callback query and the legal-accept redirect; `select("*")` replaced by explicit columns.
- `no-restricted-imports` keeps the service-role client to `src/lib` and `src/app/api`; every other import states why.

### Fixed

- The order page's "Earn a stamp" link never showed: it called loopkit's `/api/merqo/qkit-earn-config` with qkit's metrics secret, but the per-kit secrets differ. It now reads loopkit's `qkit_earn_offer` RPC (loopkit migration `0062`) with the service client, still failing closed.

### Added

- Signed-in render smoke and CSP e2e specs; the public-smoke e2e job serves the production build.
- `docs/security/2026-10-24-data-inventory.md`.

## [0.1.4] - 2026-10-24

### Changed

- Lint config now consumes the shared `@merqo/ui/eslint` preset (`@merqo/ui` v0.35.0): comment and directive hygiene, size and complexity limits, and a ban on colour literals in `src`. `eslint-plugin-sonarjs` 4.2.2 and `@eslint-community/eslint-plugin-eslint-comments` 4.8.1 pinned. The local temporal-dead-zone rule stays at `error`; `eslint.config.test.ts` asserts it and the preset rules. Files over the size or complexity limits are listed in two baseline blocks, shrunk by the split-long-files task.
- Eleven functions take a grouped argument instead of five or more positional ones; the upgrade and downgrade request routes share one vendor lookup; null checks use an `isNil` helper. No behaviour change.
- Order board test asserts `Mark Ready` and `Mark Picked Up` are named buttons and every card button has an accessible name.
- The daily-order-number tooltip and tour example read `003`/`0847`/`No. 118` without a leading `#`.

## [0.1.3] - 2026-10-24

### Security

- `notifyVendorTelegram` and `notifyPrintkit` no longer log the booth id, order number, printkit response text or database error messages. Failures log a fixed message plus the error name (CodeQL `js/log-injection`, 2 alerts), so a forged newline in a request value cannot write a fake log line.

## [0.1.2] - 2026-10-24

### Security

- `zod` 3.25.76 to 4.6.6 (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized constrained collections). `z.string().uuid()` and `z.string().email()` became `z.uuid()` and `z.email()`; test fixture UUIDs are now RFC-valid because Zod 4 checks the version and variant. An override pins any transitive `zod` below 4.6.6. `@hookform/resolvers` 3.10.0 to 5.2.2 for Zod 4 support. printkit `manage_url` is now `.optional()` before its transform so an answer without the key still parses.

- Dev tooling advisories: `vitest` and `@vitest/coverage-v8` to `4.1.12` (`@vitest/mocker` GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp), `vite` pinned as a direct dev dependency at the first patched version of its major (GHSA-587h-7wmj-h5pm and five more), `undici` override raised to `>=7.30.1`, `fast-uri` override raised to `>=4.2.3`. `@supabase/supabase-js` is now an exact pin instead of a caret range.

- `next` and `eslint-config-next` 16.3.8 to 16.4.2. next `>=16.0.0 <=16.4.0` has two critical unauthenticated remote code execution advisories, GHSA-2464-fhr4-w9xw (Image Optimization API with SVG files) and GHSA-673q-mjm6-r5xr (`use cache` functions returning typed arrays), and a high Server Actions denial of service, GHSA-p3m5-59mp-jv5r. They failed the dependency-audit job on every open PR. `pnpm audit --prod --audit-level=high` is clean again.

### Added

- Staging rollout: `docs/DEPLOY.md` lists qkit's full set of `Preview` overrides now that paykit, printkit and loopkit join staging (staging `PAYKIT_*` and `PRINTKIT_*` pairs matching each kit's `staging-kit-keys.sql`, the kits' staging URLs, the auth cookie domain for the `staging` branch only) and notes that Vercel Deployment Protection is off on this project. The `staging sync` workflow now triggers the Vercel deploy hook in `VERCEL_STAGING_DEPLOY_HOOK`, since Vercel does not git-deploy a commit it already built for production.

- Staging environment (pilot with merqo). Vercel `Preview` deployments move off the production database onto a separate staging Supabase project, and the `staging` branch is served at `qkit-staging.merqo.io`, calling merqo's `staging.merqo.io`. `docs/DEPLOY.md` drops the "deliberate gap" note and lists qkit's `Preview` env var overrides; `docs/OPS-RUNBOOK.md` adds the staging-first gate for PRs that add a migration. New `scripts/staging-migrate.sh` loads migrations into staging with psql (the kits share one migration history table with overlapping version numbers, so `supabase db push` cannot), and the `staging sync` workflow keeps `staging` on `main`. Full setup: merqo's `docs/STAGING.md`.

- `e2e/vendor-fulfillment.spec.ts`: an end-to-end guard for the board's fulfillment path. A customer orders and pays on the seeded booth; the vendor, signed in as the seed booth's owner, taps "Mark paid & start", "Mark Ready" and "Mark Picked Up" on that order's ticket; the customer's status page turns to "It's ready" and then "Collected. Enjoy!", and the booth's TV screen (`/order/{boothId}/display`) shows the number under "Ready for pickup" and drops it after pickup. The vendor is signed in without a password (`e2e/vendor-auth.ts`: a service-role magic-link token redeemed into @supabase/ssr cookies, refusing any non-local Supabase), past the legal gate (a fresh cached `legal_check_state` row) and the guided tours. New `supabase/seed/e2e-merqo-stub.sql` gives qkit's isolated local stack the `merqo.vendor_profile` RPC the dashboard reads, exposed through PostgREST's in-database `pgrst.db_schemas`. The CI `e2e (order lifecycle)` job applies it and runs the new spec. The customer checkout steps moved into `e2e/customer-flow.ts`, shared with `customer-order.spec.ts`. `E2E_PORT` moves the e2e dev server off 3000 when something else holds it.
- "Start new service" for a booth's daily item limit, for a stall that runs a morning and an afternoon service off one limit. On the board, a booth with a daily limit gets a reset button beside its item counter (in the booth row, or the Booths dialog for two or more booths); the booth edit page's Limits card has the same button once a limit is saved. Both ask first ("Start a new service? The item count for <booth> goes back to 0") and toast the result. The count now starts at the later of midnight SGT and the last reset, so midnight still resets it on its own. Migration `0106_booth_start_new_service.sql` adds `booths.cap_reset_at`, widens `qkit.booth_cups_today` and the `orders_daily_cup_cap` trigger to that window (the customer's items-left number follows, since `booth_cups_left` reads `booth_cups_today`), and adds the vendor-only `qkit.start_new_service(p_booth_id)` RPC, which stamps `now()` itself; vendors get no direct UPDATE grant on the column. New server action `startNewService`. The customer's low-stock note and refused-add message drop "today" ("Only 3 items left"), since the count can now be per service. **Apply the migration before deploying**: the RPC does not exist until it runs.
- A customer who taps "Alert me when it's ready" and allows notifications now gets the ready alert even with the phone locked or the order tab in the background. The status page subscribes the browser to web push (Android Chrome, desktop Chrome, Firefox, Edge; iOS only inside a home-screen web app, which qkit does not promote), and the vendor's Mark Ready (single or "Mark all ready") sends the push after responding, so the vendor never waits on it. The push and the page's own popup share a tag, so an open tab shows one alert. Subscriptions live in the new service-role-only `qkit.order_push_subscriptions` table; push endpoints are limited to the browsers' own push services, a dead subscription (404/410) is deleted, and a trigger drops an order's rows once it is completed or cancelled. Free: no SMS or other paid channel. Needs migration `0105_order_push_subscriptions.sql` and three env vars (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); without them nothing changes. Adds the `web-push` dependency.
- A booth that has prices but takes no payment through qkit now tells the customer how to pay. The checkout sheet (under the Total) and the order-status page (under the order total, while the order is live) say "Pay at the counter when you collect." It shows only when the order costs something. The order page reads the booth's `booths.payment` marker server-side, since the public booth RPC does not return it. No migration.
- The customer order form now tells the customer why their name and phone number are collected ("We use your name, and your phone number if you give one, to identify your order and send you order updates. See our Privacy Policy.") above the submit button, linking to `/legal/privacy`. It uses the shared `DataCollectionNotice` from `@merqo/ui` v0.33.0. Display only: no consent is recorded, and qkit sends no SMS, voice or fax marketing, so the Do Not Call Registry does not apply. The phone number stays optional. No migration.
- The vendor can decline a customer's "I've paid" claim. "View payment proof" on a claimed ticket now opens a modal instead of growing the ticket, with Accept (confirm the payment, and start the order when it is still pending) and Decline. `declinePaymentClaim` (`src/app/dashboard/order-actions.ts`) sends the claim back to unpaid in paykit through `unclaimCheckout`, the same revert as the customer's own "Tapped by mistake? Undo", mirrors `payment_status` back to `pending` and records a `decline_order_payment` audit row. The order stays on the board and the customer can pay again. A payment paykit already confirmed is never reverted: the action reports it instead. No migration.

### Changed

- `NEXT_PUBLIC_BASE_URL` dropped from `.env.example` and the README env table. No code reads it (the app takes its origin from the request host, see `src/lib/request-origin.ts`), and the Vercel variable is being removed.

- The paykit fallback URL, used when `NEXT_PUBLIC_PAYKIT_URL` is unset, is now `https://paykit.merqo.io` instead of the deleted `paykit-sg.vercel.app`. Applies to the API client (`src/lib/paykit/client.ts`) and the booth page's payment setup link. Production sets the variable, so nothing changes live.
- The order status page's "Earn a stamp" link now fails closed when `NEXT_PUBLIC_LOOPKIT_URL` is unset, as `.env.example` already said: no link and no request. It used to fall back to the deleted `loopkit-sg.vercel.app`, sending the metrics secret to a host qkit no longer owns.
- Shared-UI parity with the sibling kits. The vendor dashboard now ends with the family `Footer` (About, Terms, Privacy, no sign-in link, hidden when printing), as stockkit, printkit and paykit already do. The footer wrapper moved from `src/components/landing/footer.tsx` to `src/components/widgets/site-footer.tsx` as `SiteFooter({ showSignIn })`; the landing page and `/about` pass `showSignIn`. Four hand-rolled "back" links (menu editor, booth QR poster, event stats, admin vendor detail) now use the shared `BackButton`. No migration.
- Booths list: each card's Customer screen button is an icon again, as before #235, and still opens the same dialog as the board. Its QR code, Copy link and Customer screen icons each name themselves in a hover tooltip. `CustomerScreenButton` gains an `iconOnly` prop; the board header keeps the word.
- Booth edit page: "Printing & pickup" is split into a Printing card and a Pickup card, since printkit printing and the self-checkout pickup kiosk are unrelated settings. No migration.
- Self-checkout pickup is now set per booth. It was one vendor-wide Board settings switch (`board_settings.pickup_scan_enabled`), so a vendor could not run a pickup kiosk at one booth and staff pickup at another. Migration `0104_booth_pickup_scan_enabled.sql` adds `booths.pickup_scan_enabled` (default off), copies each vendor's current setting onto every one of their booths, and grants the column to vendors. The switch moved to the booth edit page; the order-status page reads it from the booth. The old `board_settings` key is left in the row, unread, so a rollback still finds it. **Apply the migration before deploying**: until it runs, the booth edit page and booth save fail on the missing column.
- Board settings: "Notify customers on Telegram when their order is ready" moved from Board timing into the Notifications card. "Save timing" covers only the four timing fields.
- Board settings: when desktop notifications are on for the account but this browser has not allowed them, the status beside the switch reads "On, but not on this device" in the warning colour (with the switch in the same colour) instead of a green "On". The account setting stays on, since it syncs to other devices; "Enable in this browser" is still offered.
- The prep-time estimate (the Settings "Live right now" line and the customer's wait estimate) uses the median of the last 20 completed orders and leaves out any wait over an hour as abandoned. A plain average let a few test orders left for hours show "~624 min per order". Only usable waits count towards the 10-order minimum. The Stats page's average is unchanged. New `typicalPrepSeconds` and `MAX_PREP_WAIT_SECONDS` in `src/lib/stats.ts`.
- Booth edit page: "Stop after this many items each day" and "Most items in one order" moved out of Order flow into a new Limits card, renamed "Daily item limit" and "Max items per order". Every setting row (order flow, limits, payment, printing, pickup) is now a short label with a tap-to-open (i) hint and its control in one right-hand column (`setting-row.tsx`), instead of two or three lines of grey text. The Printing card is now "Printing & pickup".
- Booth edit page: the paykit setup link opens in a new tab. The Printing card links to printkit in a new tab while printing is off too ("Open printkit", the origin of the page printkit reports); with printing on it keeps linking the booth's printer page.
- Sold-out copy no longer promises tomorrow, which a one-off event never has. The low-stock notice on the order page reads "Once they're gone, this stall stops taking orders." (was "...until tomorrow"); the closed banner reads "Sold out" (was "Sold out for today"); the refused-add and refused-order messages drop "for today". The booth form's daily-limit hint says what the midnight reset is for.
- Customer screen dialog: more room between the QR code and "Copy the link", matching the gap between the dialog's two sections.
- Booths list: the icon-only TV link to the customer queue display is replaced by the board header's "Customer screen" button and dialog for each booth, so both open the screen the same way (a window to drag onto a TV, or a code to scan).
- Board polish from the post-event walk-through. Select now sits in the Accepted column's header (the only column it acts on), and the Accepted header shows even when Incoming is empty. Next to it, "Mark all N ready" moves every order still being made to ready in one tap, with the same Undo toast as Start all; it shows for two or more preparing orders and steps aside while Select is on. Pick-up stays one at a time, or through Select, since customers collect one by one. Select mode's Cancel / Select all / Mark bar now floats over the bottom of the board, clear of a phone's home indicator, instead of being inserted above the tickets and pushing them down; the board gets room under its last ticket while it is up. With nothing ticked the bar says "Pick orders" instead of a disabled "Mark 0 Picked Up". In a ticket's "more" menu, Cancel order uses the destructive variant so its Trash2 icon is red with the words (it was muted grey); Bump to front stays in the menu, never on the number. The "Waiting for you" badge in the bottom strip never wraps, so an Incoming ticket is no taller than an Accepted one.
- Booth colour dots no longer collide. The colour was a hash of the booth id over 8 hues, so two of a vendor's five booths could share one and the dots read as meaningless. `boothColors` (`src/lib/booth/color.ts`) now gives each booth the next colour in the palette by its place in the vendor's booth list (oldest first, as the board already loads it), so up to eight booths never share a colour and a new booth leaves the older ones' colours alone. The board, the booth filter, the booth list and the ticket all take the colour from that one map. Every dot carries a hover title naming its booth, and the Booths dialog says that a booth's dot marks its tickets and its place in the filter.
- The customer's ready message no longer repeats the order number shown large right above it: "Come to the counter to collect it.", or "Come to the counter. The stall will check your payment there." while payment is still being checked.
- A live ticket's status badge ("Waiting for you", "Ready") moved from beside the number to the right-hand end of the ticket's bottom strip, opposite the waiting time. "Preparing" still goes unsaid, and a closed ticket keeps its outcome beside the number.
- `@merqo/ui` is pinned to commit `7b386558af36a1cbf008a9b4c4073c07ffc105ba` (tag `v0.34.2`) with matching build permission. v0.34.0 added `DataCollectionNotice`'s `phoneOptional`, which the order form sets so the line does not claim a phone number the customer left blank. v0.34.1 fixes `BackButton`: without a `LinkComponent` it dropped its button styling, so "Back to board" on Board settings and Profile showed the arrow stacked above the label. v0.34.2 treats a Next.js `redirect()` from a server action as navigation, so Sign out in the dashboard account menu no longer flashes "NEXT_REDIRECT" under the item while it leaves for `/login`; it keeps reading "Signing out…" until the page changes.

- Every paykit checkout qkit creates now carries `expires_at`: the time qkit gives up on the order, 30 minutes after its `created_at` (the same window the abandoned-payment sweep and the pay page's "This order has expired" use). It comes from one helper, `paymentDeadline` in `src/lib/orders.ts`, and is taken from `created_at`, never from now, so a late reload or a confirm that has to create the checkout sends the same time. `createCheckout` and `transactionIdForOrder` require it. The QR pay step, the walk-up pay step and the claim, confirm and undo lookups all pass it. Walk-up orders get the same 30 minutes even though the sweep does not cancel them; paykit only stores the value today. Needs paykit's migration `0023_transactions_expires_at.sql` (paykit#135). No qkit migration. `e2e/paykit-mock.ts` stores and echoes `expires_at`.
- The customer now pays on a page paykit hosts. `/order/{boothId}/pay` sends them to paykit's `pay_url` (`createCheckout` now sends `return_url` and `title` and reads `pay_url` and `status`); paykit takes the screenshot and the "I've paid" tap and sends them back, and on the return `loadPreClaimContext` gives the order its number through `finalizePaidOrder`, which also covers a return that beats paykit's callback. If the customer closes the tab on paykit's page, the callback still numbers the order. Needs paykit's migration `0024_hosted_pay_page.sql` applied and `kit_api_keys.return_origin` set for qkit's row (qkit's origin); until then the pay step shows "Could not open the payment page". No qkit migration.
- Removed what the pay page no longer uses: `pay-form.tsx`, `qr-image.ts`, `claimPayment`, `claimCheckout`, `paymentProofSchema` and its constants. The origin helper from the order status page moved to `src/lib/request-origin.ts`. `e2e/paykit-mock.ts` serves a stub pay page and `e2e/customer-order.spec.ts` follows the redirect.
- A customer's payment screenshot now goes to paykit with the "I've paid" claim instead of into qkit's own storage. `claimPayment` forwards the file in the same request as the claim, and paykit stores it before the claim commits: if anything fails up to that point the order is left exactly as it was and the customer can try again. qkit keeps no copy, and new orders no longer write `orders.payment_proof_path` or `payment_proof_hash`. Both columns and the `payment-proofs` bucket stay, and an order claimed before this change still opens its screenshot from there.
- On the board, "View payment proof" reads through one server action, `getOrderPaymentProof`. It checks with the vendor's own session that the order's booth is theirs, then asks paykit for a link to the screenshot and for its signals. The duplicate warning now comes from paykit and covers every payment that vendor has taken through any Merqo app; when the other payment is not a qkit order the vendor can open, it reads "This photo was already used for another payment". A claimed order with no screenshot says so instead of showing nothing.
- The amount hint under the screenshot ("Amount matches $X.XX" or "Couldn't confirm the amount") now comes from paykit, which reads the photo on its server just after the claim. The board no longer reads the photo in the vendor's browser. When paykit has no reading, no amount hint is shown; that includes every order claimed before this change.
- Removed the in-browser OCR: `tesseract.js`, `tesseract.js-core` and the 16 MB of self-hosted assets under `public/tesseract/`. A vendor opening a payment proof no longer downloads them.
- Internal: `src/lib/hash.ts` is removed; nothing in qkit hashes a file any more. `e2e/paykit-mock.ts` accepts a multipart claim and answers `GET /api/v1/checkout/{id}/evidence`.

### Fixed

- Four fixes from the 2026-10-17 production sweep. No migration.
  - At a booth that waits for the customer's "I'm here" tap, a pending ticket's badge reads "Not here yet" instead of "Waiting for you", since the order is waiting on the customer. "Start now" stays as the override for a customer who arrives without tapping. Pending orders at other booths still say "Waiting for you". `OrderStatusBadge` gains an `awaitingArrival` prop, set by the board from `requires_arrival_confirm`.
  - The walk-up dialog no longer says "Payment comes next" for a $0 cart, and a $0 walk-up never gets a payment step: the dialog opens its payment step only for an amount above 0 (`place_walkup_order` already writes a $0 order as `not_required`).
  - A walk-up added from this board's New order dialog no longer also plays the new-order sound and toasts "New order #003" through realtime on that same board. The dialog reports each placement to the board (`onPlacing` / `onPlaced`), which skips the alert for its own order by booth and number, holding a walk-up INSERT that arrives before the placement returns. Other devices still alert.
  - A finished order's status page shows when it was placed once, in the header stamp, instead of again as "Placed 3 min ago" further down.
- The board's per-booth item count ("1/10 items", for a booth with a daily limit) now follows new and cancelled orders live. It used to be read once when the board loaded, so during a rush it stayed at the load-time number until a reload. The board now re-reads `booth_cups_today` for a booth whenever its realtime channel reports a change to one of that booth's orders, and for every capped booth after a reconnect. New `useCupsToday` hook; `useRealtimeOrders` gains an optional `onChange` callback. Start new service still drops the count to 0 straight away. No migration.
- Board: on a phone the floating "?" tour replay button no longer covers the selection bar's right-hand action ("Pick orders", "Mark N Ready", "Mark N Picked Up"). It is hidden while the bar is open and comes back on Cancel. A `body:has([data-selection-bar])` rule in `globals.css`; the bar carries the new `data-selection-bar` attribute.
- Board: an Incoming ticket was 4px taller than an Accepted one with the same content. The "Waiting for you" pill made its footer 44px against the timer-only 40px. The footer row is now a fixed `h-10` with no vertical padding, so both are 40px. The pill stays bottom-right.
- Landing page: "See how" scrolled the "Up and running in three steps" heading under the sticky nav. The `#how` section now has `scroll-mt-20`.
- With Select on, a phone could not scroll the last ticket clear of the floating selection bar when the bar wrapped to two rows; the board now leaves room for both rows.
- TV customer screen (`/order/{boothId}/display`): a number marked picked up, by staff tapping "Mark Picked Up" or by the customer's own pickup scan, now leaves the screen at once. The 10-minute grace period now applies only to an order the ready auto-clear timer cleared, read from the existing `orders.auto_completed` column. No migration.
- TV customer screen: the Ready column is sorted by `ready_at`, most recently readied first, and a number keeps its place as it ages. The 5-minute fresh highlight is now only a visual cue; it no longer pulls a tile to the front, so tiles no longer jump back once they stop being fresh. The ready cap hides the longest-ready numbers first. Preparing keeps its order.

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- The payment proof's duplicate warning names the other order by the number on its board card. With daily numbering on it said "order #0024" (the permanent number) for an order the board and the customer knew as #001. Today's orders now go through `vendorFacingOrderNumber`, the same setting and day baseline as the ticket; an order from an earlier day keeps its permanent number, as on the board, and adds its day ("order #0024 on 1 Oct"). Applies to orders whose screenshot is in paykit and to older ones still in qkit's bucket.
- The `mutation (changed lib)` CI job no longer fails with `no merge base`
  when main moves while a pull request is open. Its step fetched the base
  branch with `--depth=1`, which made a full-history checkout shallow at
  main's new tip, so the diff against the base had nothing to compare from.
  It now fetches without a depth limit.
- A long hint beside a section title now wraps inside the screen instead of staying on one line that runs off a phone. `@merqo/ui` is pinned to commit `9b202ba529dfd8fecbcbb9a2cc9f37efba4bd7d4` (tag `v0.32.3`) with matching build permission; tests that import it no longer load about 3,400 Simple Icons modules.
- The menu manager's info icon has a finger-sized (44px) touch area on a phone or tablet, like every other hint. It was a 16px target. `@merqo/ui` is pinned to commit `a8063218e5954bef35242550070606628d79375a` (tag `v0.32.2`) with matching build permission, and now provides that touch area itself.
- Customers can attach a saved payment screenshot. The upload field used to
  open the camera only, so someone who paid on the same phone had no way to
  pick the screenshot from their photos.
- The payment page now says what is being paid for: the booth, the items,
  the amount, and that payment is due within 30 minutes. It has a way back to
  the menu, shows the attached screenshot, and highlights one next step at a
  time.
- After a customer sends their payment, the order page no longer asks them
  to pay again while the stall checks it. A cancelled order that was paid for
  now says how to get a refund.
- Info icons that only opened on hover now open on a tap as well as on hover and keyboard focus: the one in the menu manager, and any hint beside a section title. A phone or tablet could not open them. `@merqo/ui` is pinned to commit `cb9dd39ab56d6bc2030d30edb7474ee8ebf60820` (tag `v0.32.1`) with matching build permission.
- Confirming a payment, recording one, and undoing "I've paid" no longer
  fail for an order that was already awaiting payment when the vendor edited
  their payment details. qkit now looks the order's paykit transaction up
  instead of creating the checkout again.
- Board settings no longer logs a hydration error when desktop
  notifications are on but this browser has not allowed them. The note about
  the browser's permission now appears once the page has loaded, since the
  server cannot know the browser's answer.
- Status text is readable in daylight. Order badges, the waiting-time label,
  allergen chips, "Open", "Payment sent" and error text were drawn in colours
  tuned for fills, and fell below the 4.5:1 contrast needed for text on the
  cream background (the "Waiting for you" badge was 2.2:1). Each colour now
  has a darker shade for text. The blue payment button, the Undo button and
  the keyboard focus ring were fixed the same way.
- A late ticket says "Late" beside its waiting time and shows a warning icon,
  so it no longer differs from an ageing one by colour alone.
- A menu with sections is readable on a phone. The section list was a side
  column that left an item's name as little as 5px wide; on small screens it
  is now a row of chips pinned to the top, and names wrap to two lines.
- The order page says when it has lost its connection ("No connection. Last
  checked 2:04 pm.") instead of silently showing a stale status.
- An order that fails to go through shows the reason beside the "Place
  order" button and says it is safe to try again, in place of a message that
  vanished after a few seconds.
- A menu card for an item with options now shows how many are in the basket.
- The X that closes a dialog, "Show all", "Show more" and the recent-order
  links are finger-sized on touch screens. The checkout bar clears the home
  indicator on phones without a home button.
- On the order board, marking several orders at once can be undone from its
  message, the row with the batch buttons stays on screen while orders are
  being ticked, and a tap anywhere on an order ticks it. On a phone the
  Incoming/Accepted switch is finger-sized.
- Eighteen messages no longer contain a long dash, for example "Order
  changed. Please refresh." The lint rule that enforces this now covers
  messages returned from server code, not only text in components.
- A choice that costs extra shows its price on the choice ("Oat milk
  +$1.00"), not only after it is picked.
- With "reduce motion" switched on in the device settings, dialogs, sheets
  and menus appear at once instead of sliding and zooming.
- Messages that pop up in the corner follow dark mode.
- For screen readers: each order on the board and each item on a menu is a
  heading, and the fields of the menu editor have names.
- Rows in menus and dropdown lists are finger-sized on touch screens. The
  walk-up dialog fits above a phone's browser bar.
- Bulk pickup checks each order is still ready and reports partial failures without changing payment state.
- Anonymous basket holds no longer disable purchases or trim another customer's cart; actual stock and vendor order limits still apply.
- Shared image handling releases failed render resources and safely decodes storage paths; money fields reject amounts outside safe integer precision.
- Stats on a phone: the revenue figure and the best seller's name are no
  longer cut off ("$1,804.…"); each now takes the full row. The profit table
  fits the screen (a long item name wraps instead of pushing Profit and
  Margin off to the side), and an option's name is shown in full in the
  options breakdown.
- Finger-sized on touch screens: the date-range buttons on Completed and
  Stats, "Export CSV", the "By volume / By revenue" switch, and the new-order
  sound choices. They were 24 to 36px tall.
- The note about notifications on iPhone and iPad opens on a tap. It was a
  hover tooltip, which an iPhone or iPad cannot open.
- Each hint on Board settings has its own name for screen readers. All nine
  were announced as "More about this setting".
- The (i) hints on Board settings and on a booth's Payment options open on a
  tap. They only opened on hover, so on an iPad or phone they did nothing.
- The Telegram new-order alert names the order by its ticket number. With
  daily numbering on it said "#0847" for a ticket reading "#002". The alert
  also separates the total with a dot, not a dash.
- A walk-up order keyed in without a name no longer reads "Walk-up · walk-up"
  on its ticket.
- An order is called by one number everywhere. With daily numbering on, the
  ticket read "#002" while the new-order toast, the desktop notification and
  the walk-up dialog (its toasts and the payment step's title) named the same
  order by its permanent number, "#0847".
- Picking PayNow or a payment link on a new booth starts from the payment
  details you already saved, the same as on an existing booth. It started
  blank, so a second booth meant retyping the payee name and UEN.
- A booth saved with "No online payment" stays that way. The booth page filled
  its Payment section from the vendor's payment details, which are shared by
  every booth, so a booth without payment opened showing PayNow selected, and
  saving any other change on the page then switched payment on for it. The
  booth's own setting now decides what is selected; the saved details only
  fill the fields in when that method is picked.
- The walk-up dialog that opens by itself for an event booth now starts on
  that booth. With several booths open it started on the first one listed.
- The order board no longer opens the walk-up order dialog on every load
  because of a walk-up booth that is switched off. Only an active walk-up booth
  triggers it.
- "Add to order" is always in view in the customise sheet. With several option
  groups or a short phone it sat below the fold with nothing to show the sheet
  scrolled; it is pinned to the bottom of the sheet now. The item photo is
  capped at 28% of the screen height, and no longer collapses to nothing when
  the sheet has to scroll.
- The booth filter on the order board shows its label from the first paint. It
  was blank for a moment on load.
- The payment buttons on a ticket ("Confirm payment received" with the amount)
  wrap on a narrow card. Three across on a tablet, the label overflowed the
  button.
- Controls are finger-sized on every touch device, phones and iPads alike.
  One rule in `globals.css`, keyed on `pointer: coarse` and not on screen
  width, makes every button, field and dropdown at least 44px tall; a mouse
  keeps the compact heights. Switches, the small (i) hint icons, the menu's
  drag handle and the tick box on a ticket in Select mode keep their drawn
  size and get a 44px touch area. Checked at phone width on the order board,
  booth settings and the menu manager, none of which scroll sideways. The
  board's header shows the active count as a number alone on a phone, so its
  controls stay on one row.
- The CSV format hint on the menu page opens on tap. It opened on hover only,
  so it could not be read on a phone or an iPad.
- The five-minute order cleanup uses two partial indexes (migration `0098`)
  and no longer reads the whole orders table on each run.
- A payment link reopened long after its order was placed no longer shows a
  PayNow QR. An order still unpaid after 30 minutes reads "This order has
  expired" with a clear "do not pay", and a claim against it is refused, so an
  old link cannot take money or put a fresh "says paid" on the board for an
  order nobody is making.
- The public queue display leaves off orders more than 12 hours old. An order
  left unfinished on the board from an earlier day was shown to today's queue
  as a number still being prepared.
- Unpaid orders are cancelled, and ready orders auto-cleared, on a schedule in
  the database (`qkit.sweep_stale_orders`, every five minutes, migration
  `0097`). Both ran only while a vendor had the order board open, so with no
  board open an abandoned order kept its stock and a ready order stayed on the
  queue display.
- Saving a booth on a plan without stock caps no longer wipes a daily limit
  that was already set. The limit keeps working, is shown in booth settings,
  and can be removed there; setting or changing one still needs an Event pass
  or Pro.
- Touch targets on a phone are a full 44px for the landing page's "Sign in"
  and "Get started", the social icons on order pages, "Order something else",
  and the queue display's "Enable sound".
- With "number from 1 each day" on, the customer's "Your orders here" list
  and the "order is ready" notification name the order by the day's number,
  the one the status page and the board show. They used the permanent number.
- The Completed page shows today's tickets under the day's number and finds
  them by either number. Tickets from earlier days keep their permanent
  number, since a daily number repeats from one day to the next.
- The landing page FAQ says PayNow checkout exists and that qkit does not
  hold the money; it said qkit took no payment. Its pricing answers follow
  the prices that are set, and say "free in beta" only while none is.
- A booth's state has one name each: Open, Paused (your own switch), Closed
  (outside the hours you set) and Over plan limit. The same switch was called
  Paused on the board, Closed in the booth editor, Off in the booth list and
  Active on a new booth, and the booth list used Paused for a booth the plan
  would not serve. The editor's button is now "Pause booth" / "Resume booth".
- The walk-up dialog's name field starts empty, with "Walk-up" shown as the
  placeholder. It was prefilled, so a named order began by clearing it.
- Opening the checkout sheet on a touch screen no longer raises the keyboard
  over the order before it has been read. Tap the name field to type.
- Customer pages have a main landmark for screen readers. The price, cost,
  sold-out limit and section fields of a menu item, the walk-up booth picker
  and the maintenance banner switch are linked to their labels.
- The dashboard shows the outline of a page while it loads, not a spinner.
- An order confirmed with "confirm and start" records when it was paid, once
  paykit's callback is switched on: the callback fills in the paid time that
  action leaves empty.
- A print request repeated for the same order is no longer logged as a
  failure. printkit already printed such an order only once.

### Changed

- Payment details are now entered in paykit only. A booth's Payment section
  is a switch ("Take payment for orders at this booth"), one line naming what
  paykit has on file, and a link to paykit's payment setup page, which offers
  "Back to your booth" after a save. With nothing on file the switch is off
  and the link reads "Set up payments in paykit". Saving a booth stores which
  kind of payment it takes from the switch plus the kind paykit reports, so a
  booth picks up a method changed in paykit the next time it is saved. If
  paykit cannot be reached, the booth keeps its current payment setting and
  everything else on the form still saves. Booths already taking payment are
  unchanged, and a payment QR image uploaded here earlier stays where it is.
- Board settings: every switch saves the moment it is flipped. Four of them
  (Telegram ready alerts, self-checkout pickup, daily order number, wait-time
  estimate) used to wait for a Save button further down the card while the
  sound and notification choices saved at once, so a flipped switch could look
  saved when it was not. The Save buttons now cover only the number fields;
  "Save customer screen" is "Save backup time".
- Removed the `globals.css` rule that gave tap-to-open hint icons their 44px touch area. `@merqo/ui` v0.32.2 provides that area on every info icon, so the rule did nothing. No visible change.
- The brand palette follows combination 146 of Sanzo Wada's "A Dictionary of
  Color Combinations": Khaki for the primary colour (a two-point shift from
  the previous ochre), Deep Grayish Olive in place of moss green, and Diamine
  Green for "open", "paid" and other success states. The Pro badge is filled
  with the olive. Raw palette colours (emerald, amber, blue) are replaced by
  named tokens.
- Internal: the AI harness follows templateCentral 6.0.1 where it applies to
  this repo. Hook commands no longer depend on the shell's current
  directory, the end-of-turn test run is skipped when nothing changed, the
  guard against skipping git hooks closes six gaps, and the integrity check
  fails on an unreadable manifest. See the dated entry in `AGENTS.md`.
- Internal: the AI harness follows templateCentral 6.0.4. The guard against
  committing to `main` reads the branch of the directory a command runs in,
  so commits from a git worktree are no longer blocked by the main
  checkout's branch. The comment check on pull requests fails when the base
  branch is missing, where it used to pass.
- Internal: `src/components` and `src/lib` are grouped into folders. Shared
  components sit in `widgets/`, `layout/`, `board/`, `tour/`, `landing/` and
  `order/`; the `merqo-*`, `admin*` and `booth-*` library files sit in
  `lib/merqo/`, `lib/admin/` and `lib/booth/`. Files moved and imports
  followed; no code inside them changed.
- Internal: the customer order page and the walk-up dialog share one basket
  hook (`useCart`) for adding, increasing and decreasing lines. Each had its
  own identical copy. No change to how either behaves.
- The sort switch on the order board is finger-sized on a touch screen (44px,
  was 36px), like every other switch of its kind.
- Internal: four copies of the pill switch and eleven copies of the page
  header are now one component each (`SegmentedControl`, `PageHeader`); the
  payment-marker and daily ticket-number lookups each live in one file. No
  change to what any page shows.
- At an event booth (one set to walk-up order entry) the walk-up dialog stays
  open after each order and clears for the next customer, with stock counts
  refreshed. It used to close after every order, so a queue meant tapping
  "New order" each time. Other booths are unchanged: the dialog closes when
  the order is done.
- Taking payment for a walk-up order is now a second step. "Add order" places
  the order, then the dialog shows the amount and the booth's own payment QR
  (PayNow with the amount already filled in, or the payment link or QR image)
  for staff to turn towards the customer. "Payment received" marks the order
  paid; "Collect later" leaves it unpaid on the board. This replaces the
  "Payment collected" switch, which had to be set before the order existed
  and never showed a QR. A booth with no payment set up sees no payment
  control at all.
- A ticket's waiting time is back in its bottom-left corner, under the action
  button, where it was before the redesign. Beside the number it crowded the
  part of the ticket that gets read out. The top-right corner now holds only
  the "more" menu, and the bottom-right corner is free.
- The landing page's sample order tickets match the ticket vendors now work
  from: a large number and name, options always visible, one attention line
  in place of the payment badges, and no "Show options" control or prices.
- The booth's daily limit is worded as items, not cups, everywhere a vendor or
  customer reads it ("Stop after this many items each day", "132/200 items",
  "Only 3 items left today"). It always counted every item the booth sells,
  whatever it is; the wording said cups because the first stall to ask sold
  drinks. The menu page now also stops a basket at what is left, instead of
  letting it fail at checkout. Setting the daily limit is part of stock caps
  (Event pass and Pro), like the per-item sold-out limit.

- The customer's order page shows the order's four stages, Received, Preparing,
  Ready and Collected, each with its own icon and all visible from the moment
  the order is placed, so the finish is in sight for the whole wait. It replaces
  a three-segment bar that merged Ready and Collected, which left a collected
  order looking the same as one still on the shelf. "Received" is already
  reached when the page opens, the stage the order is on pulses, and Ready takes
  over the block in its own colour. The copy now speaks as the stall ("We're
  making it now", "It's ready") with one line of what to do next.
- An order that is over, or one reopened more than 12 hours after it was placed,
  reads as a receipt and cannot pass for a live order: the number is struck
  through, a stamp says Collected, Cancelled or Past order, and the date and
  time it was placed (and collected) are printed in full. The daily order number
  resets, so without this a customer could show last week's `#012` at the
  counter as today's. A reopened order shows no live tracker and no payment
  prompt, and its button reads "Order this again".

- The order ticket is rebuilt around what staff read at the counter. The
  number and the customer's name are the largest things on it, every
  customisation is always visible on one line per item, and there is one
  button: the next step. Vendors said they had no time to expand a ticket
  mid-service and that a growing stack of badges was becoming noise, so the
  expand control is gone and the badges (payment, print, walk-up, passed over)
  are replaced by a single attention line that shows only the most urgent
  thing: a payment to check, a label that did not print, a later order already
  out, then a payment not made yet (`ticketAttention` in `src/lib/ticket.ts`).
  "Paid" and "Preparing" are no longer stated, since they are the states with
  nothing to do. Bump and cancel moved into a "more" menu so a mis-tap lands on
  nothing destructive. Prices, the total and the timestamp now appear only in
  order history; on the live board the amount owed is printed on the payment
  button, the one place it is being checked.
- Waiting time on a ticket reads `2h 5m` or `6d` past an hour, not `9802m`.
- The booth form's Printing section is a switch, the printer's status and one link. The link opens the page printkit names for that booth: the printer picker when the booth has no printer, the booth's printer when it has one. A booth not yet saved with printing on shows "Save this booth first" instead, since printkit does not know it until then. Advice on which printer to buy now lives in printkit only, where it is kept current. While printkit cannot be reached there is no link, since printkit is what supplies it.
- qkit no longer stores printkit's location id on a booth. `booths.printkit_location_id` stays as an unused column; no migration.
- The print-status callback accepts the order's id as `source_ref` or `order_id`.
- A deployment with no printkit address or secret says "Printing isn't configured yet" in the Printing section, not that printkit cannot be reached.

### Removed

- The PayNow and payment-link form inside the booth editor, with qkit's own
  rules for a UEN, mobile number, payment link and QR image. paykit's form is
  the only one now, so the two can no longer disagree about what is valid.
  Internal: `upsertVendorConfig`, `saved-vendor-payment.ts`,
  `paymentConfigSchema` (a `{kind}` marker schema remains) and the reserved
  `stripe` kind on the TypeScript side are gone.

### Added

- qkit now hears from paykit when a payment changes. paykit calls
  `POST /api/paykit/payment-status`; qkit reads the payment's real status back
  from paykit and gives the order its number, alerts the vendor, sends the
  print job and updates the payment status, the same as when the customer
  taps "I've paid". Needs `PAYKIT_CALLBACK_SECRET` and the matching row in
  paykit; until both are set nothing changes.
- The board's Incoming column has "Start all" when two or more orders can be
  started together. One tap starts them and offers Undo for 8 seconds. It
  leaves out an order whose payment still needs checking, and every order at
  a booth that holds prep until the customer arrives.
- Mark several orders picked up in one tap. Select now ticks ready orders as
  well as ones being made: "Mark N Ready" moves the ticked orders that are
  still being made, "Mark N Picked Up" clears the ticked ones that are ready.
  At the end of an event, Select all then two taps clears the whole board.
- The order board's "Select" mode has "Select all", so a stall that had no
  time to mark orders one by one during service can tick every order still
  being made and send them to Ready with one "Mark N Ready". It lives inside
  Select rather than as its own button, to keep the board to one batch
  control. With auto-clear on, the board then empties by itself. A tap-to-open
  hint beside "Select" says what it is for.
- The menu CSV has a `choice_code` column, so short codes for the order ticket
  can be set in bulk and survive an export and re-import. It is the last
  column: a file exported before it existed still imports unchanged, and a
  blank cell leaves the choice printing in full. A code longer than 6
  characters is reported against its row.
- The live board has a "Customer screen" button for the big-number queue
  display. It opens the display in its own window to drag onto a TV, monitor
  or an iPad used as an extended display, in any browser, and shows a code to
  scan (with a link to copy) for a device that is not attached to the computer.
  The display was reachable only from a small icon on the booth list, and a
  vendor at an event did not find it.
- A vendor can give each option choice a short code for the ticket ("LS" for
  "Less sugar"), set under the choice's Advanced options with a suggestion from
  its initials. A choice with no code prints in full: codes are never derived
  automatically, because initials collide ("Soy" and "Skim") and a wrong drink
  costs more than the space saved. When two options on one item would print the
  same text, each is prefixed with its group.
- A booth can limit how many items one customer order may carry ("Most items
  in one order" in booth settings, every plan), so the first person in the
  queue cannot take the whole tray. The menu page says the limit up front and
  refuses an add past it; the `orders_max_items_per_order` trigger enforces it
  for every customer-placed order. Orders the vendor keys in are not limited.
  Migration `0096`.
- A customer's basket now holds its items for five minutes on a booth with
  finite stock (a daily total or a sold-out limit on an item). The next
  customer sees those items as "In another basket" instead of being offered
  them and refused at checkout, and when two people reach for the last one the
  first basket wins and the second is told. A hold is soft: it changes what
  other customers are shown and never blocks an order, so a flood of fake
  holds cannot take a booth offline or cost a real sale. Placing the order
  releases the hold. Migration `0096`.

- `e2e/smoke.spec.ts`: a public smoke spec (the landing page and `/login` render). The CI job that ran only the auth-guard spec runs both and is named `e2e (public smoke)`, the same name and baseline as every other kit.
- The booth form and the menu manager ask before unsaved changes are thrown
  away: on Cancel, on a link to another page of the dashboard, and on closing
  or reloading the tab. The browser's Back button is not covered.

### Changed

- Separate pickup and its undo from payment confirmation; retain explicit
  Paykit-backed settlement for completed unpaid orders and preserve concurrent confirmations.
- Merge section-owned board settings atomically under vendor RLS, preserving
  unrelated preferences from concurrent saves. Apply migration 0096 before rollout.
- Keep unresolved customer order keys across manual retries and contain optional
  banner, cup-count and feedback transport failures.
- Preserve unknown order attempts across reload using opaque replay metadata;
  display transport failures and retry guidance in settings, profile and booth forms.

- Remove the unused featured-booth testimonial scaffold and its always-empty
  landing-page call; retain the existing trust strip.

- The repository moved from the `cljiahao` GitHub account to the `merqo-io` organization. `@merqo/ui` now installs from `github:merqo-io/merqo-ui` at the same tag, with the lockfile and tarball URLs updated to match.
- The `secret scan (gitleaks)` CI job runs the pinned gitleaks release binary, verified against the release checksum, instead of `gitleaks-action`. The action is free only for personal-account repos and needs a paid license on organization-owned ones, so every run failed after the move to `merqo-io`. It scans the PR commits, or the pushed range on `main`.
- `pnpm check` now fails on a `const` or `let` read before its declaration
  (`@typescript-eslint/no-use-before-define`, variables only). A closure that
  reads a binding declared below it is a temporal-dead-zone crash at request
  time, and `tsc` does not flag it; one took the vendor order board down in
  production with the build and every test green. Functions and types stay
  exempt, since hoisted helpers below their use are the house style, and test
  files are exempt because `vi.mock` factories read fixtures declared below
  them by design. Three existing cases were reordered to comply:
  `NOTE_SPACING`/`PEAK_GAIN` in `src/lib/order-alerts.ts` and `empty` in
  `src/app/dashboard/stats/reviews-card.tsx`.
- Performance: the site-wide maintenance banner is read from the database at
  most once every 30 seconds per server instance, not on every page request.
  A banner switched on in `/admin` can take up to 30 seconds to reach every
  visitor.
- Split the four source files over 900 lines by moving whole pieces into
  sibling files, with no behaviour change: the order board (1315 lines to
  788), the menu editor (1090 to 818), the order ticket (1036 to 675) and the
  customer order form (994 to 890).

### Security

- Revoke service-role truncation of immutable audit trails. Apply migration 0099 after database validation.

- Limit administrator-membership lookup to the current user or trusted service callers. Apply migration 0098 after database validation.

- Enforce free-vendor booth limits after whole statements and serialize competing creations; apply migration 0097 before rollout, after database validation.

- Reject stale order-board advance taps before deriving the next state, including
  bulk Mark Ready requests against orders another device already made ready.

- Restrict order-number allocation, vendor/printer INSERT privileges and rate-limit
  buckets; exclude private option costs from customer projections and prevent
  customer pickup from confirming payment. Apply migration 0095 before rollout.
- Normalize secret-file guards across Windows paths, require approval for
  governance and workflow writes, and keep injection-phrase detection advisory.
- Patch published development-tool advisories and ignore secret-bearing environment
  variants while retaining the blank template.

- Raised the `sharp` override to `>=0.35.5` for GHSA-wq5f-xc86-pv6w, a
  high-severity vulnerability in its librsvg dependency. It reaches production
  through `next`'s optional `sharp` peer, and it was failing
  `pnpm audit --prod --audit-level=high` on every PR.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- Keep distinct cart selections separate for separator characters and Unicode labels; safely open the intended notification destination and contain audio-unlock failures.

- Improve small brand-link and form-boundary contrast in both themes while preserving primary button fills and allowing utility styles to override base resets.

- Paginate Merqo metrics, vendor activity and admin vendor detail reads; retain
  booth images referenced beyond the API row cap and include older paid-event
  reviews. Surface optional cleanup failures without reversing successful writes.
- Reject non-boolean booth toggle values and intermediate print callback states;
  recover from rejected QR regeneration and clipboard requests.
- Keep spreadsheet formula-like menu and sales text literal in CSV exports while
  retaining numeric money values and correctly quoting carriage returns.
- Respect Paykit's returned payment state during claim, undo and vendor confirmation races; load independent booth payment and booking prefill requests concurrently.
- Look up Merqo vendor status by the matched vendor ID so row limits cannot hide active accounts; reject invalid admin payment amounts and show a recoverable error when password-reset session checks fail.

- Reconcile missed realtime order updates, preserve CSV multiline descriptions and
  distinct option statistics, and paginate vendor order totals beyond the API cap.
- Keep integration tests off application environment files, remove the unused local
  avatar primitive, and update setup and security documentation.

- The vendor order board loaded again. `/dashboard` threw
  `ReferenceError: Cannot access 'cupsToday' before initialization` on every
  request: the booth `.map` that builds `boothViews` reads `cupsToday`, which
  was declared below it. `tsc` does not catch that, since the read is inside a
  closure rather than in the same scope, so it only showed up as a 500 in the
  Vercel runtime log and a minified React error in the browser. The cup counts
  are now read before the views that use them.

### Added

- A booth can stop taking orders after a set number of cups each day
  (`booths.daily_cup_cap`, migration 0094). An event working to a fixed stock
  ("200 cups, then we stop") previously had only `booths.hours`, a wall-clock
  close, and an order count is not a cup count: one order can carry four or
  five cups, so capping orders either turns customers away early or blows past
  the stock. The cap counts the sum of item quantities over the day's
  non-cancelled orders, resets at SGT midnight, and is enforced by the
  `orders_daily_cup_cap` trigger rather than in app code, so every insert path
  is covered. The trigger takes a per-booth advisory lock, so two customers
  checking out on the last cups cannot both pass. Cancelling an order returns
  its cups. The customer's menu page says how many cups are left under ten and
  shows "Sold out for today" at zero (`booth_cups_left`, readable by anon and
  exposing nothing but that number); the vendor's board shows a `132/200 cups`
  counter per capped booth, amber inside the last tenth.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- The board's own daily-number baseline now counts only orders placed today,
  the same SGT window the server-side query uses. An order still in progress
  from an earlier day became the baseline and rebased itself to `#001`, while
  the customer's status page, the TV queue display and the printed label all
  still showed its permanent number, since none of them can rebase an order
  that predates today's first. Seen on production: the board read `#001` for an
  order the queue display read `002`.

### Changed

- The customer's order page now says what it will do, "Keep this page open. It
  turns to Ready when your order is up.", instead of only "Remember this number
  for pickup". The chime, desktop notification and title flash
  `OrderStatusPoller` already fires only help someone who knows to leave the
  page open, so customers queued back up at the counter to ask.
- A collected order keeps its place on the customer queue display for ten
  minutes, still shown as ready. `board_settings.ready_auto_clear_min` marks an
  order collected whether or not anyone picked it up, so a number could vanish
  from the screen while the cup was still on the shelf, leaving a customer who
  was not watching their phone at that moment with nothing to check.
- The booth list's queue-display button is labelled "Open the customer queue
  display" and says in its tooltip that a spare phone or tablet works as the
  second screen, which is the answer when a laptop will not extend onto a
  monitor.
- Order cards show every customisation without a tap. Options were collapsed to
  one truncated line behind a "Show options" button, so whoever writes the order
  onto a cup paid one tap per order, over a hundred across a service, for text
  the card had room to print. They now start shown and the toggle folds them
  away instead. The customer name and item names wrap rather than truncate: a
  cut-off name is what staff write on the cup and call out.
- On a phone the board offers a switch between Incoming and Accepted, each with
  its count. Stacked on a narrow screen, Accepted sat under however many
  Incoming cards there were, so staff accepted an order on the board, could not
  find it on their phone, and read that as the two devices being out of sync.
  The tablet and desktop two-column layout is unchanged.

### Added

- An order card carries a "Passed over" badge when a later order from the same
  booth is already ready or collected (`overtakenOrderIds` in
  `src/lib/orders.ts`). A barista calls a number across a noisy counter, nobody
  hears it, and the order is never marked while later ones are: the customer
  waits on a screen that never changes, and nothing on the board said so. A
  badge rather than a third column, since counter space is tight, and the card
  colours staff already read are untouched.

### Security

- Pinned `source-map-js` to `>=1.2.2` for GHSA-68fv-2mgg-jv7q, a high-severity
  event-loop denial of service through indexed source-map section offsets. It
  reaches production through `next` > `postcss`. Range-scoped in
  `pnpm-workspace.yaml` like the other force-patched transitives, so it clears
  itself once `postcss` ships the patched version.
- Bumped `next` 16.3.4 to 16.3.8 for GHSA-vcvr-r3jv-pc5j, a critical remote
  code execution in `next/og`'s `ImageResponse` affecting `>=16.2.0 <16.3.6`.
  qkit renders its icons through `ImageResponse` (`src/app/apple-icon.tsx`,
  `src/app/icon.tsx`, `src/app/icon-192/route.tsx`,
  `src/app/icon-512/route.tsx`), so this was reachable rather than theoretical. `eslint-config-next` moved with it to stay in step.
  `pnpm audit --prod --audit-level=high` had been failing on every PR.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- A customer whose phone reopens an old order-status URL now sees that it is an
  older order, with the date it was placed and a link to order again, instead of
  a page that looks live. A repeat customer's browser can restore an earlier
  visit's URL (history, a restored tab, a home-screen shortcut); the page then
  showed a big number the stall was not calling, since `displayOrderNumber`
  returns the raw permanent `order_number` once the daily rank would be
  non-positive, and a status that would never change, because the order the
  customer was actually queued for is a different row. The Telegram connect
  offer is hidden on such a view, which could not have reached them. New
  `isStaleOrderView` in `src/lib/orders.ts`; `elapsedLabel` also counts in days
  past two days, rather than reporting an order as "700 hr ago".

- The vendor order board now shows the same per-day order number as every
  customer-facing surface when it was opened before the day's first order. The
  daily order-number reset (`board_settings.daily_order_number_reset`, on by
  default since migration 0067) rebases each order to its rank within the SGT
  day. The board read that baseline once, server-side, at page load, so a board
  opened while staff were still setting up had no baseline for the booth and
  showed permanent numbers (`#0847`) for the whole service, while the customer's
  status page, the TV queue display and the printed label each recomputed the
  rank (`#001`) live per request. Staff were calling a number no customer was
  holding. `RealtimeOrderBoard` now latches the lowest `order_number` it has
  seen per booth as a fallback baseline when the server had none.
- Picking a booth banner, menu photo or payment QR and then leaving the form
  without saving no longer leaves the image in storage. These uploaders now
  use `@merqo/ui` v0.32.0's `deferUpload`: a picked image is resized and
  previewed locally, and only uploaded when the vendor clicks Save
  (`commitPendingImages`). If the save then fails, the images it uploaded are
  deleted: by the menu manager and booth form in the browser
  (`removeUnsavedImages`) for failures before anything is written, and by
  `saveBooth` itself for failures inside the action, since only it knows
  whether the payment QR already reached paykit before a later step failed.
- Bumped `@merqo/ui` to `v0.32.0`.

### Changed

- `src/lib/booth-images.ts` now uses `@merqo/ui`'s shared
  `storagePathFromPublicUrl` instead of its own copy. Behaviour for real
  uploads is unchanged; the shared parser additionally rejects a path with an
  empty segment, so a malformed URL can never target the wrong object.
- Replacing or clearing a payment QR image from the booth Payment section now
  deletes the old image. The fix lives in paykit's config API, which this form
  saves through, so no qkit code changed for it.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- Images uploaded into a booth, menu or payment form that the vendor never
  saved are now deleted instead of staying in storage forever. Each upload is
  written the moment it's picked, so an abandoned form left an object nothing
  referenced, and save-time cleanup only knew about images that were once
  saved. After a successful `saveBooth` or `saveMenuItems`, a new
  `sweepUnsavedUploads` (run with `after()`, so saves don't wait) lists the
  vendor's `booth-images` folder and removes objects older than 24 hours that
  none of their booths, their avatar, or their paykit payment QR reference. If
  paykit or the booths read is unavailable the sweep skips entirely, so a live
  QR is never deleted.
- The live order board no longer logs React hydration error #418 on load.
  `useNow` seeded its clock from `Date.now()` during render, so the server HTML
  and the browser's hydrating render computed different elapsed "Nm" labels on
  order cards whenever a minute passed between them (or the clocks differed).
  `useNow` now returns `null` until mounted and sets the clock in an effect,
  the same pattern the queue display and order-status page already use.
  `OrderCard` renders no elapsed label (and a "fresh" tone) until then, and
  `PassCountdown` holds its line with a non-breaking space. Ticking and the
  `enabled` flag are unchanged.
- Replacing or removing a profile icon no longer leaves the old image in storage.
  `ImageUploader` names every upload randomly and nothing ever deleted the object
  it replaced, so each change orphaned one file. The save handler now deletes the
  previous avatar after a successful save, and deletes the fresh upload after a
  failed one, via a new best-effort `removeReplacedAvatar` in
  `src/lib/image-upload-adapter.ts`. It checks all three public avatar buckets,
  since all five apps share one signed-in user and one `avatar_url`, and ignores
  OAuth provider pictures. A failed save also now restores the previous avatar
  instead of showing one that was never saved.
- Bumped `@merqo/ui` to `v0.31.4`, which adds `storagePathFromPublicUrl`.

### Added

- `GET /api/printkit/printer-status`, so the booth page can ask printkit
  whether a booth's printer is set up and reachable without the
  `PRINTKIT_KIT_SECRET` ever reaching the browser. A printkit outage answers
  "can't check right now" rather than "no printer", because only one of those
  should worry a vendor mid-service.
- `getPrinterStatus` in `src/lib/printkit/client.ts`, and
  `usePrinterStatus` in `src/hooks/`, replacing `use-printer-presence.ts`.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- Payment-proof storage is now bounded at every layer. The
  `payment-proofs` bucket had no `file_size_limit` or `allowed_mime_types`
  (unlike `booth-images`, hardened in `0037`), so nothing in storage capped
  what one screenshot-paid order could write. Migration `0093` sets a 1 MB
  limit and JPEG/PNG/WebP only, pinned by two new pgTAP assertions.
  `claimPayment` now validates the upload against a new
  `paymentProofSchema` (non-empty, <=1 MB, JPEG/PNG/WebP) before touching
  anything, and `pay-form.tsx` checks the same schema on selection so a bad
  file is rejected before the round trip.
- Removed `claimPayment`'s server-side `resizeToWebp` call. It needs a
  `<canvas>`, so in a server action it always threw internally and fell back
  to the original file: a silent no-op. The browser resize in `pay-form.tsx`
  was, and remains, the one that actually shrinks proofs. The stored
  extension and content type now come from the file's real MIME type.
- Bumped `@merqo/ui` to `v0.31.3`: where a browser cannot encode WebP,
  `canvas.toBlob` silently returns a PNG, which `resizeToWebp` had
  mislabelled `image/webp`. A PNG of a photo is several times larger than a
  JPEG, so on such a browser proofs were being stored larger than intended.
  It now falls back to JPEG and labels the result truthfully.

### Changed

- The booth Printing section now reports the booth's printer from printkit
  over HTTP, instead of subscribing to printkit's realtime presence channel
  with qkit's own Supabase client. printkit now supports printers that reach
  it by themselves (a cloud printer, a 4G printer), and those have no bridge
  device to publish presence at all, so the old signal could only ever see a
  Bluetooth bridge. The section names the printer, tells "no printer set up"
  apart from "offline" apart from "can't reach printkit", and, while no
  printer is set up, explains in one line that a self-connecting printer
  works with just an iPad, linking to printkit's Bluetooth guide for why the
  alternative needs a second device. `PrintingSection` no longer takes
  `vendorId` or `printkit_location_id`.
- Bumped `@merqo/ui` to `v0.31.2`. v0.31.0 replaced the package-wide
  `"use client"` banner with per-module directives, so a plain-data export
  is a real value inside a Server Component rather than an opaque
  client-reference stub. That was the root cause of qkit's own 2026-09-18
  production outage; until now the fixes were workarounds at each call site.
- Adopted four primitives promoted into `@merqo/ui` v0.31.0, deleting the
  qkit copies: `safeRedirectPath` and `resizeToWebp` (were
  `src/lib/safe-redirect.ts` / `image-resize.ts`), `BackToTop` (was
  `src/components/back-to-top.tsx`) and `GoogleMark` (was
  `src/app/(auth)/login/google-mark.tsx`).
- `ticket-section.dom.test.tsx`'s tooltip assertion now expects one matching
  node instead of two. The radix `@radix-ui/react-tooltip` that `@merqo/ui`
  bundles moved from 1.2.8 to 1.2.16, which no longer renders a
  visually-hidden duplicate of the tooltip text. Per the previous comment's
  own instruction, confirmed the surviving node is the visible one (it
  carries `role="tooltip"`, `data-state="delayed-open"`, the popper
  positioning styles and the real `bg-popover` classes) and not the hidden
  duplicate. The assertion also now checks those attributes directly.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- `resizeToWebp` on a filename with no dot returned the whole name as the
  extension (a file called `photo` gave `ext: "photo"`). stockkit's copy had
  guarded this and qkit's had not; fixed upstream in v0.31.1.

### Note

- `order/[boothId]/[orderNumber]/payment-actions.ts` calls `resizeToWebp`
  from a `"use server"` module. `resizeToWebp` is browser-only (Canvas), so
  on the server it throws internally and its catch returns the original file
  — the payment-proof upload succeeds but is never actually resized. This
  was equally true of the qkit-local copy, so the move changes nothing;
  recording it rather than leaving a silent no-op. A real server-side resize
  would need a different implementation.
- `order/[boothId]/pay/pay-form.tsx` and `[orderNumber]/page.tsx` keep
  `react-qr-code` rather than `qrSvg`. `qr-image.ts` insets the rasterized
  PNG ~8% precisely because `react-qr-code` emits zero margin, and bank apps
  scanning a saved photo can fail on edge-to-edge modules; `qrSvg` emits
  `margin: 1`, so swapping changes the quiet zone on a live payment path.

### Added

- Saving a brand-new booth's first menu now lands on its QR page (with a
  "here's your QR to start taking orders" toast) instead of the plain
  booth-edit page — nothing previously nudged a first-time vendor toward
  actually sharing their QR after finishing setup.
- A warning banner on the booth's Printing toggle when printing is on but
  no printer has ever been registered for that booth — previously this
  state only showed a plain, easy-to-miss link.

### Changed

- `BackButton`, `ElevatedCard`, `SOCIAL_LINK_FIELDS`/`SocialLinksFields`,
  `MoneyInput`, and the landing `Footer` now come from `@merqo/ui`
  (bumped to v0.29.1) instead of a qkit-local copy — each was confirmed
  duplicated across 2 or more sibling kits before promoting, no behavior
  change intended.
- Bumped `@merqo/ui` to `v0.30.0`.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- `/legal/terms` now shows only qkit's own Annex schedule, not every
  sibling kit's, via `@merqo/ui`'s new per-kit `getLegalDocSource`/
  `LegalDocument` scoping. `legal/accept/actions.ts`'s recorded
  `doc_sha256` now hashes that same scoped content.
- The customer menu page's multi-section jump nav is now a sticky sidebar
  (with a thumbnail from each section's first item, Oddle-style) beside the
  scrolling item list, at every screen size — replacing the old horizontal
  pill row, which forced mobile customers into a scroll-up-tap-scroll-down
  cycle to switch sections on a long menu.
- The Payment and Printing booth-form sections now state the actual
  consequence of skipping them ("customers have no way to pay through
  qkit", "no auto-printed label"), not just "Optional" — a rushed
  first-time setup could finish with no payment method configured with
  no signal until a customer couldn't pay.
- Bumping an order to the front of the board is now a single instant tap,
  matching every other rush-hour action on the card — it was the only one
  still gated behind a confirm dialog, and a mis-bump has no real
  consequence (an order just preps slightly out of its natural order).

### Added

- The Booths page now has its own dashboard tour (anchored on "New booth"),
  instead of the tour button always redirecting to `/dashboard` regardless
  of which page you were on. Built on `@merqo/ui`'s new `DashboardTours`
  multi-tour router (bumped to v0.27.0); `vendors.tour_seen_at` is replaced
  by `vendors.tours_seen`, a per-tour seen-state map (migration `0092`).
- Live printer connectivity status on the booth's "Print via printkit"
  toggle: once printing is on and the booth has been saved, a status row
  shows "Printer connected" or "No printer connected" in real time,
  reusing printkit's own bridge Presence channel (no printkit-side change
  needed). New `booths.printkit_location_id` column mirrors the id
  printkit assigns when a booth is registered.
- Payment-first checkout: placing an order no longer assigns it a number —
  a payment-required order now redirects to a new `/order/{boothId}/pay`
  gate and only gets its order number once the customer claims payment with
  a required photo proof-of-payment upload (migration `0087`'s nullable
  `orders.order_number` + a new `qkit.assign_order_number` function). Closes
  a real gap where an unpaid order's kitchen ticket and vendor Telegram
  alert used to fire the instant an order was placed, and a booth with no
  accept-gate could start prep on an order nobody had paid for yet.
- The vendor board, the public TV/queue display, and the customer wait
  estimate all now exclude an unpaid QR order until its payment is claimed
  — a walk-up order (already handled face-to-face at the counter) is
  unaffected.
- Reconciled vendor review action, "Mark paid & start": merges "Confirm
  payment" and "Start now" into one tap for any pending order with
  unconfirmed payment (QR or walk-up), with its own dedicated undo.
- Client-side, self-hosted OCR + duplicate-photo hint on the vendor's
  payment-proof review — a non-blocking assist ("Looks like $12.50, paid",
  "This photo was already used for order #031"); the vendor's own manual
  review stays the real gate.
- Unpaid QR orders now auto-cancel 30 minutes after creation, polled from
  the vendor's own open dashboard the same way the existing ready-order
  auto-clear sweep works.
- New public, unattended self-checkout pickup kiosk
  (`/order/{boothId}/pickup`): a paired Bluetooth HID barcode/QR scanner
  reads the QR now shown on a customer's own order-status page once their
  order is ready, marking it collected with no staff involvement. Opt-in
  per vendor via a new "Self-checkout pickup" dashboard setting; the
  existing one-tap "Mark Picked Up" board button stays as the fallback.
- Customer checkout moved from inline name/phone fields at the bottom of the
  order page into a bottom `Sheet` opened by the sticky CTA. On a long,
  multi-section menu the fields used to sit below every item on the page,
  forcing a full scroll before a customer could even see them; now the
  fields are always one tap away regardless of menu length.
- Public TV/second-screen queue display for one booth
  (`/order/{boothId}/display`, linked from the booth list's new "Open TV
  display" button) — answers Manfred's second-event AAR ask for a
  customer-facing screen his "won't watch a phone" customers can glance at.
  Groups active orders into Preparing/Ready for pickup, polling every 5s
  (no realtime — the same public-read constraint the customer status page
  already works around), and gives an order a few seconds of flash
  animation the moment it transitions to ready, plus an optional chime
  once the vendor taps "Enable sound" once to unlock it.
- The order number's trailing digit is now visually emphasized (`OrderCard`,
  the TV/queue display), for a vendor using a physical pickup-shelf-slot
  system (bubble-tea-chain style — slotting an order by its last digit).

### Security

- Added rate limits to several previously-uncapped paths: an authenticated
  vendor's own upgrade-request action, the `/api/v1/sales/summary` export,
  and the customer order-status page's polling reads (`getOrderStatus`,
  `getWaitEstimate`, `getPaymentStatus`) and pre-claim checkout lookup —
  none were a cross-tenant or authorization gap, but all were previously
  uncapped self-inflicted-load or load-amplification surfaces.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- A printed order label showed the raw, permanent order number, not the
  vendor-facing daily-reset number the board/TV display/customer status
  page all show when `board_settings.daily_order_number_reset` is on —
  the two numbers' last digits could disagree, undermining the physical
  pickup-shelf-slot workflow above.
- `merqoBaseUrl()`'s hardcoded fallback (`legal-gate.ts`, `legal/accept/
actions.ts`, `merqo-customer-notify.ts`) pointed at a stale, pre-custom-
  domain `.vercel.app` host that now 404s on every route, including `/`.
  merqo's real production host is `www.merqo.io` (confirmed live).
  `MERQO_BASE_URL` was never set as a Vercel env override on any kit, so
  every kit→merqo call relying on this fallback (legal-accept/
  legal-status, and the previously-silent customer-Telegram-connect
  calls) has been hitting a dead host in production. Fixed the fallback
  literal here; also needs `MERQO_BASE_URL` set explicitly to the real
  host in Vercel (Production + Preview) as the primary, immediate fix —
  the code fallback is defense-in-depth for whichever environment
  forgets it.
- The vendor's "Mark paid & start" review action now confirms via paykit
  before marking the local order confirmed, matching the existing
  `confirmOrderPayment` action; it previously skipped paykit entirely,
  leaving a payment-first order's paykit transaction stuck at `claimed`.
- `authenticated`'s `UPDATE` grant on `orders` is column-scoped (migration
  `0088`) so a vendor's own client can no longer set a still-unassigned
  `order_number` directly, bypassing `qkit.assign_order_number`.
- The checkout sheet's submit button no longer promises "Get my order
  number" on a payment-required booth, where the number isn't assigned
  until after payment is claimed; it now reads "Place order".
- "Mark paid & start"'s undo no longer reverts `payment_status` back —
  paykit's own confirm already happened for real and can't be undone, so
  the previous undo left qkit's local mirror disagreeing with paykit
  forever. Undo now only un-starts the order (back to pending); payment
  stays confirmed, same no-refund-rail principle `cancelOrder` already
  applies. Also: a lost-race 0-rows result from "Mark paid & start" itself
  no longer blindly reports failure or success — it re-checks whether the
  order actually reached the confirmed+advanced state before deciding.
  Undoing now also confirms this in a toast ("Payment stays confirmed.
  Refund via paykit if needed."), so a vendor doesn't assume Undo also
  unconfirmed the payment.

### Changed

- `src/lib/printkit/client.ts`'s two functions now share one request helper
  (`printkitRequest`, mirroring paykit's own) instead of duplicating the
  fetch/timeout/error-handling logic.
- `src/lib/merqo-customer-notify.ts`'s three functions now share one fetch
  helper, and `mintCustomerConnectToken` Zod-validates its response body
  instead of trusting an unchecked cast.
- The six admin pages/routes reading `merqo.support_messages` now import one
  shared `MerqoSupportMessagesSchema` type (`src/lib/merqo-support.ts`)
  instead of each redeclaring their own narrowed copy.

### Security

- `notifyVendorTelegram`/`notifyPrintkit` (`src/app/o/[code]/actions.ts`)
  were exported from a `"use server"` file, making each independently
  callable as its own client-invokable Server Action regardless of the fact
  that only `placeOrder`/`claimPayment` were ever meant to call them —
  bypassing all of `placeOrder`'s own validation and rate limiting. Moved
  both to a plain module (`src/app/o/[code]/notify.ts`, no `"use server"`
  directive). `notifyPrintkit` also no longer trusts a caller-supplied
  `customerName`; it now prints the order's own stored name.
- `qkit.place_walkup_order`'s `EXECUTE` grant was left at the default
  `PUBLIC` (includes `anon`); revoked, matching every other write RPC in
  this schema (migration `0089`). Not exploitable today — the function's
  own `vendor_id = auth.uid()` check already rejects an anonymous caller —
  fixed as defense-in-depth consistency.
- Bumped `next` to `16.3.4` (`eslint-config-next` to match) and refreshed
  `browserslist` to `4.28.9`. Clears two critical Next.js RCE advisories
  (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4), a high `sharp`/libheif
  advisory (`sharp` resolves to `0.35.4` via next), and the long-standing
  high `browserslist` advisory (GHSA-73wf-gq98-2v4g) that earlier PRs this
  cycle had merged past under admin override. The `pnpm audit` high gate is
  now clean.
- Dropped `output: "standalone"` from `next.config.ts`. qkit deploys only
  to Vercel, which bundles functions itself and does not use the standalone
  output, and under `next` 16.3.x that config also made Vercel's build
  finalizer look for a server trace file it no longer writes there.
- Bumped `vitest` and `@vitest/coverage-v8` to `4.1.11` (from `3.2.6`).
  Clears GHSA-82fw-gwwq-j7x9 (`@vitest/mocker` path traversal / arbitrary
  file read, patched only in `4.1.11`) and, via `fast-uri` `4.1.4`, four
  high `fast-uri` advisories (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc,
  GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp) reaching in through
  `@stryker-mutator/vitest-runner`. The `qs` override is raised to
  `>=6.16.0` (two moderate advisories via `@stryker-mutator/core`), leaving
  the dependency audit clean at every level.
  `src/lib/order-alerts.test.ts`'s `AudioContext` constructor mock switched
  from an arrow to a `function` expression: `vitest` 4 no longer lets an
  arrow `vi.fn()` be `new`-ed.

### Changed

- Onboarding tour's final step now tells a vendor which booth-page
  sections are optional (Payment, Printing, Booking Status) before they
  create their first booth, instead of leaving them to discover it
  section by section.
- Booth settings' Paykit booking ID field now links out to paykit's
  bookings list ("Find or create a booking in paykit"), so a vendor
  linking a booth to a booking doesn't have to already know paykit
  exists as a separate product and go find it unprompted.

### Added

- `/about`, a public "Why Merqo" page rendering `@merqo/ui`'s shared
  `AboutMerqo` origin-story component, linked from the landing `Nav` and
  a new `Footer` component (extracted from `src/app/page.tsx`'s
  previously-inlined footer markup so `/about` could reuse it). `Nav`'s
  "FAQ" link now points at the absolute `/#faq` instead of a bare `#faq`
  fragment, since it renders on `/about` too, not just `/`.

### Changed

- Dropped the required typed legal-name field from terms/privacy
  acceptance — a plain ToS/Privacy clickwrap doesn't need a signatory
  name for evidentiary strength beyond the existing (vendor_email,
  auth_uid, doc_type, doc_version, ip, user_agent, timestamp) record kept
  on merqo. `@merqo/ui` bumped to `v0.25.0` (`v0.24.0`:
  `TermsAcceptanceCheckbox` no longer takes `legalName`/
  `onLegalNameChange`; `v0.25.0`: a pre-lawyer-review legal-wording pass,
  the new `AboutMerqo` component, and a "← Back" button on every
  `/legal/*` page).

### Added

- Legal-document gate. `/legal/terms` and `/legal/privacy` render the shared
  `@merqo/ui` documents (also linked from the landing footer), and a signed-in
  vendor whose accepted terms/privacy versions are behind `@merqo/ui`'s
  `LEGAL_VERSIONS` is bounced to a `/legal/accept` interstitial before any
  dashboard route renders. qkit owns no acceptance record — merqo does — so
  currency is a bearer-authed `GET /api/merqo/legal-status` call cached in a
  new `legal_check_state` TTL table (migration `0084`, 5 min, mirroring
  merqo's `vendor_sync_state`), and acceptance is two idempotent
  `POST /api/merqo/legal-accept` calls (one per doc, each hashed via
  `getLegalDocSource`). The gate fails closed: an unreachable merqo or an
  unset `MERQO_CUSTOMER_SECRET` routes the vendor to `/legal/accept` rather
  than past the gate. `@merqo/ui` bumped to `v0.24.0` — `acceptLegalTerms`
  forwards the vendor's real `ip`/`user_agent` (read via `headers()`) in
  both `legal-accept` POST bodies. (A typed legal-name field was briefly
  required here too, then dropped again — see below.)

- Menu CSV export/import gains a `cost` column (`name,description,price,
cost,available`) — the item's own private `cost_cents`, an always-visible
  field next to Price in the UI, not an Advanced one, so it belonged in the
  plain CSV alongside price rather than staying UI-only. Blank means unset,
  same as price; a negative or non-numeric cost is a per-row import error.

- Menu CSV export/import now round-trips per-item customization (option
  groups/choices) — 4 new columns, `group_name,group_type,choice_label,
choice_price`. An item row has `name` filled; any choice rows immediately
  below it (blank `name`) attach to it, consecutive same-`group_name` rows
  forming one group. Export emits a continuation row per existing choice;
  import replaces a name-matched item's `option_groups` entirely when its
  row carries valid choice rows, and leaves them untouched otherwise. Every
  parser error now names its real spreadsheet row number (`Row N: ...`)
  rather than a flat array index, since choice rows nest under their item.
  Choice-level cost delta and allergens stay UI-only (behind "Advanced"),
  out of CSV scope. See
  `docs/superpowers/specs/2026-09-01-menu-csv-customization-design.md`.

- `OptionGroupsEditor`'s per-choice "Advanced" panel (cost + allergens) now
  matches the item-level allergen picker right above it in the UI: each
  allergen gets its icon (a new shared `ALLERGEN_ICONS`, `allergen-icons.ts`,
  extracted from what was a `menu-editor.tsx`-local const), the decorative
  `border-l` box is gone in favor of the same flat spacing the item-level
  picker already used, and a caption now names the scope ("Extra cost and
  allergens only when this choice is picked") — it isn't a duplicate of the
  item-level allergens, but nothing said so before. A new "Customer sees
  when picked" live preview makes that connection concrete: it renders the
  same item + choice allergen union `item-customizer.tsx` already computes
  for the customer at order time, with the same pill styling, so a vendor
  can see their per-choice tag actually merges with the item's own rather
  than feeling like separate, disconnected busywork. No data-model change —
  confirmed against DoorDash's own per-modifier allergen support and the
  EU 1169/2011 / California ADDE Act's documented substitution-labelling
  risk that per-choice tagging exists specifically to avoid; item-only
  tagging was considered and rejected as the wrong direction for a menu
  with real customization, not merely more effort. The group header (name +
  Pick one/Pick any + delete) is now one compact row instead of two stacked
  full-width ones, reading as a lighter one-time setting rather than
  competing with the repeated choice rows below it; the preview now sits
  behind its own divider with real bottom spacing, fixing a real layout
  bug where its pills rendered flush against the next choice's own border.

- Dedicated menu-manager page (`/dashboard/booths/{boothId}/menu`), split out
  of the main booth-edit form: CSV export/import (`name,description,price,
available`, matching each item by exact name to update in place rather
  than duplicate) and drag-to-reorder items (`@dnd-kit/core`/`sortable`/
  `utilities`, new pinned dependencies) — booth order is just JSONB array
  order, so no schema change. A new `saveMenuItems` action is now the
  exclusive write path for `booths.menu_items`; `saveBooth` no longer reads
  or writes that column at all, closing off a stale-state clobber risk
  between the two pages. `booth-form.tsx`'s Menu section is now a read-only
  item-count link into the new page — its layout is 2 natural-height grid
  columns now, not the old `row-span-2` sized around the full menu editor
  that used to live there, and the grid gap is horizontal-only (a row-gap
  on top of every `Section` card's own trailing margin was doubling the
  visible gap where the two columns stack on mobile). A vendor with zero
  items can now download a CSV template (`menuCsvTemplate()`) showing the
  expected columns instead of Export CSV being simply disabled with nothing
  to give them. Creating a brand-new booth now redirects straight to its
  menu page right after the first save (instead of the booth list) —
  `saveMenuItems` needs a real `boothId`, which only exists post-save, so
  one save gets a vendor straight to the same CSV/reorder/image menu
  surface every booth uses, rather than a separate inline-editing path.

- `printing-section.tsx`: a general "Manage printers in printkit ↗" link,
  independent of the print-enabled switch or a saved booth — the existing
  "Choose the printer for this booth →" link only ever showed once printing
  was already turned on, so a vendor setting up printkit first had nowhere
  to go. Matches `payment-section.tsx`'s always-shown paykit link.

- `docs/OPS-RUNBOOK.md`: symptom-level operational triage doc for live-event
  issues, separating what's self-serve (a vendor's own board fixes a stuck
  order, Vercel's Promote-to-Production for a bad deploy) from the
  fail-closed integrations whose missing env var looks identical to a bug,
  from what genuinely needs a dev.

- `docs/meta/2026-08-15-master-task-registry.md`: recorded a deferred idea
  (read-only admin order lookup) and why an admin order-write override was
  explicitly rejected before the first live event.

- Admin overview now surfaces stuck orders: a "Stuck orders" stat tile plus
  a booth/status/elapsed-time list flagging orders sitting in a
  non-terminal status (pending/confirmed/preparing/ready) for more than 30
  minutes, derived from `order_status_events` (`src/lib/stuck-orders.ts`).

- Menu editor: each allergen checkbox in the "Advanced" picker now shows a
  small emoji icon next to its label, and any item with allergens set shows
  a compact icon-only summary next to the "Advanced" toggle — a vendor
  scanning the list can see allergen info without expanding every item.
- Event-mode booths can now link a paykit booking: a vendor-pasted
  `paykit_booking_id` on the booth (`booths.paykit_booking_id`, shown only
  while "Default to walk-up order entry" is on) surfaces that booking's
  live deposit/balance status inline on the booth edit page, via paykit's
  new `GET /api/v1/bookings/{booking_id}` (`getBookingStatus`) — no more
  checking two separate dashboards for one event's order vs. payment
  status. No lookup/matching by name or phone; the vendor already owns
  both sides.
- Menu editor: a "Duplicate" action per item, creating a fully independent
  copy (own id, "(copy)" suffix, deep-cloned option groups/allergens) —
  qkit has no shared/live-linked modifier groups yet, so this is always a
  starting-point copy, never a reference.
- Allergen tag list widened from 6 ad-hoc tags to cover the EU's 14-allergen
  list (Regulation 1169/2011) plus caffeine — purely additive, every
  pre-existing tag value is unchanged so a booth's already-saved menu items
  keep validating.
- Customer-facing menu now groups items under a booth's own category
  sections with a jump nav, once a vendor has set up 2+ categories with
  items in them — a booth with 0 or 1 category still renders as a single
  flat "Menu" list, unchanged.

- Customer-facing menu cards now show a tappable icon-only badge per
  allergen (`AllergenBadges`, `@/components/allergen-badges`) — previously
  allergen info only ever surfaced inside the Customize sheet, invisible
  for an item with no option groups (no Customize button to open) and
  whenever the booth is closed and browse-only (the sheet can't open at
  all). Tap or hover reveals the name via `InfoTooltip`'s `trigger="tap"`
  mode. The Customize sheet's own allergen badges now pair each one with
  its icon too, matching the vendor-side pickers instead of text-only.
  `ALLERGEN_ICONS` moved from `dashboard/booths/allergen-icons.ts` to
  `lib/allergen-icons.ts` so both surfaces share one icon set.

- Menu editor mobile/UX pass: `Duplicate`/`Remove` buttons on a menu item
  now stack vertically instead of side by side (was leaving an empty gap
  under them next to the two-line name/description); removing an item is
  still instant (no blocking confirmation, which would slow down bulk
  edits) but now offers a 60s "Undo" toast; each option-group's choices can
  now be collapsed to a "N choices" badge, for vendors with many
  customization groups per item; a choice row now stacks its inputs on
  narrow screens instead of clipping the choice-name placeholder against
  the fixed-width price/Advanced/delete controls.

- Menu categorization: a booth can now define ordered menu sections and
  assign each item to one. The data model (`menu_categories`/
  `item.category`, migration 0066) and the customer-facing grouping
  (`groupByCategory`) already existed; only the vendor-facing UI to
  populate either field was missing. New `saveMenuCategories` action, its
  own write path for `booths.menu_categories` (same column-ownership split
  as `saveMenuItems`/`saveBooth`). Deleting a section never touches items
  that referenced it — a dangling id already buckets into "Other" on the
  customer menu.

  Section management is built into `MenuEditor` itself, not a separate
  block (a first pass used a standalone `MenuCategoriesEditor` list above
  the item editor — replaced same-day). Once a booth has sections, items
  render grouped into collapsible per-section cards, each with a tinted
  header band (rename/reorder/delete/collapse inline in it) so a section
  reads clearly against its items, plus a trailing "No section" card,
  always present once sections exist, for anything unassigned; with zero
  sections, the item list stays the plain flat view it always was. Section
  reassignment works both ways — the per-item "Section" dropdown, and
  cross-group drag: drop an item on one in another section to reassign +
  land at its position, or on a section's own drop zone (its header or
  empty-state text both work, so an empty section is still a valid target)
  to reassign to the end of that group. The "Available" toggle is an
  icon-only `Eye`/`EyeOff` button in the item's action row instead of a
  full-width `Switch` block, which read as disproportionately heavy for a
  boolean most vendors never touch — now built on the same `Button`
  primitive as its Duplicate/Remove neighbors (was a hand-rolled `button`
  with its own near-but-not-quite-matching hover/focus styling).

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- Dragging a menu item toward a different section snapped it back to its
  original slot mid-drag (the drop itself still worked, but it looked
  broken) — `useSortable`'s own transform only repositions within its own
  list, so it reset outside one. Added a `DragOverlay`: a floating clone
  that actually follows the pointer across sections, with the original
  row dimmed in place instead.
- A handful of leftover em dashes in user-facing copy across the booths
  dashboard (the "Duplicate" button's tooltip, the event-mode create page's
  description) — replaced with plain punctuation.
- Menu CSV import preview silently omitted each row's description (the
  import itself always carried it through correctly — the preview list
  just under-displayed it) — now shows `Name (description) $price`.
- Menu-manager's CSV-format explanation was a permanent 4-line paragraph
  under the "Menu" heading — moved into an `InfoTooltip` (same one-sentence-
  behind-`(i)` pattern `payment-section.tsx`/`settings-form.tsx` already
  use), wrapped to a fixed width so it reads as short lines instead of one
  unbroken one.
- 5 leftover em dashes in user-facing copy (the platform-banner placeholder
  and its helper text, a settings tooltip, the customer Telegram-connect
  blurb) — replaced with plain punctuation, now caught for good by a new
  ESLint gate (see AGENTS.md's "No-em-dash hard gate" note).
- Printing section showed two printkit links stacked once a booth had
  printing on and was saved: the booth-scoped "Choose the printer for this
  booth →" deep link, and a general "Manage printers in printkit ↗" link
  right under it, doing the same job worse (no auto-selected booth). The
  general link now only shows when the booth-scoped one isn't available.
- `OptionGroupsEditor`'s per-choice "Advanced" (cost + allergens) moved from
  an inline accordion to a `Dialog` — leaving several choices' panels open
  at once (easy to do, nothing auto-closed them) turned the editor unreadable
  fast. The trigger grows a small dot once a choice has a cost or an
  allergen set, so that's still visible without opening every dialog. Group
  headers and their choices were also hard to tell apart (same input size,
  no separation) — the header row is now weighted `font-medium` and the
  choices sit indented in their own tinted sub-panel underneath it.

### Changed

- Menu item card's Available/Duplicate/Delete cluster: Available stays its
  own standalone toggle, Duplicate and Remove now live behind a "More
  actions" kebab menu instead of two more equal-weight icon buttons next to
  it. Grouping a state (Available) with two actions as three identical
  icons was the actual issue, not their individual styling.
- Menu item card field order and layout, grounded in Deliveroo/Square/Toast's
  own item-form conventions: "Section" now sits right after name/description
  (was below Price/Cost); Price, Cost, and Sold-out limit collapse into one
  compact three-column row, each with a real persistent label instead of
  placeholder-only text (which disappears once filled in, leaving a bare
  number) and its longer explanation behind a tap `InfoTooltip` instead of a
  permanent caption paragraph repeated on every item. The Available/
  Duplicate/Delete action column goes horizontal at tablet+ width instead of
  always stacking three icons tall.
- `booth-form.tsx`'s "Order flow" section: both controls are now `Switch`
  ("Hold prep until the customer arrives" was a `Checkbox`, inconsistent
  with its neighbor "Default to walk-up order entry") — standardized to
  match every other standalone on/off feature toggle in the app.
- Stats dashboard's margin table (`MarginTable`, `/dashboard/stats`) now
  renders through the shared `@merqo/ui` `DataTable` component instead of
  hand-rolled JSX, matching the `AuditLogTable` adoption pattern already
  used in `/admin` — same columns (Item/Sold/Profit/Margin), cell
  formatting, and profit-descending sort, rendering only.
- Bumped `@merqo/ui` to v0.22.1: `OrderStatusBadge` now renders through the
  new shared `StatusBadge` component (extracted from this file, chosen as
  the design target over other kits' plain shadcn `Badge` uses) instead of
  its own hand-rolled markup — qkit's `STATUS_CONFIG` label/colour map is
  unchanged and passed through as the `config` prop, so rendered output is
  identical.
- Admin console: the audit-trail viewer and pricing form now render through
  the shared `@merqo/ui` `AuditLogTable`/`PricingForm` components instead of
  hand-rolled JSX, matching loopkit/paykit/stockkit's admin consoles (same
  underlying data and actions, rendering only); `pricing-form.tsx` is
  renamed to `pricing-section.tsx` (`PricingSection`) to match paykit's
  naming, and the audit log no longer paginates client-side (the shared
  component renders every fetched row, same as its sibling-kit usage).
- Booth settings: "Hold prep until the customer arrives" and "Default to
  walk-up order entry" moved out of "Hours & availability" into their own
  "Order flow" section (they're about how an order is entered/prepped, not
  when the booth is open), the em dash in the walk-up copy is gone, and
  Printing now shows a "Choose the printer for this booth →" link once
  printing is on and the booth is saved, deep-linking into printkit's
  bridge page for that specific booth. The single-column mobile layout now
  stacks Menu right after Hours/Order flow instead of at the very bottom,
  above Payment/Printing/Social links; the two-column tablet/desktop
  layout is unchanged.
- Bumped `@merqo/ui` to v0.20.0: the stats strip's `StatTile` now wraps the
  new shared `StatTile`/`DeltaPill` content instead of a fully local
  implementation — no visible change, qkit's own card shell (border,
  fade-rise animation, ember `primary` accent) is unchanged.
- Bumped `@merqo/ui` to v0.19.0: the account menu's theme control now sits
  behind a collapsed "Theme · {current}" submenu instead of three
  always-expanded radio options.
- Cleaned up the dashboard onboarding tour copy (`src/components/tour-steps.ts`):
  removed em dashes and the trailing arrow from the desktop step text, and
  added a small inline "example order" preview card to the first step (new
  `.tour-example` CSS in `src/app/globals.css`) so a new vendor can see what
  a real order looks like before any orders exist.
- That "example order" preview's status pill now renders the real
  `OrderStatusBadge` component instead of a hand-copied color/label — the
  hand copy had already drifted (it used the primary color, not the real
  `status-preparing` token).

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- `/admin` (the admin overview) returned a 500 for every admin: `page.tsx`
  is a Server Component and passed `formatAction={humanizeAction}` — a
  function — straight to `@merqo/ui`'s `AuditLogTable`, which is a Client
  Component (the package ships as one all-`"use client"` bundle), and React
  cannot serialize a function across the server→client boundary. The
  callback now lives in a small `"use client"` wrapper
  (`src/app/admin/audit-log.tsx`, `AdminAuditLog`); the page hands over only
  the serializable `entries` array. Broken since the `AuditLogTable`
  adoption; not caught earlier because `/admin` is dynamic, so the build
  never renders it.
- `/dashboard/stats` had the same latent crash from the `MarginTable` →
  `@merqo/ui` `DataTable` adoption — `columns` (with `cell`/`getRowKey`
  functions) was passed from a Server Component. `margin-table.tsx` is now
  `"use client"`. It only surfaced for a Pro vendor who had entered per-item
  costs, so it had not yet been hit in production.

### Added

- printkit print-job integration: a new `orders.print_status` enum column
  (`not_required`|`queued`|`sent`|`printed`|`failed`, migration 0081).
  `placeOrder` now fires an outbound job-creation call to printkit's
  `/api/v1/print-jobs` (`src/lib/printkit/client.ts`, bearer
  `PRINTKIT_KIT_SECRET`) as a redundant, fire-and-forget channel alongside
  the existing vendor Telegram alert — a printkit outage never affects
  order placement. A new inbound `POST /api/printkit/print-status` route
  (bearer `PRINTKIT_CALLBACK_SECRET`) lets printkit report a job's
  in-flight/terminal status back; the vendor dashboard board now renders a
  "Print failed" badge (`PrintBadge` in `src/components/order-card.tsx`)
  when a job lands on `failed` — the only visible v0.1 outcome of this
  integration. See `.env.example` for the three new required env vars
  (`NEXT_PUBLIC_PRINTKIT_URL`, `PRINTKIT_KIT_SECRET`,
  `PRINTKIT_CALLBACK_SECRET`) and `docs/DEPLOY.md`.
- Event-mode setup flow for event-cart/pop-up vendors: a new `booths
.walkup_default` flag (migration 0080) makes walk-up order entry the
  booth's default way orders get created, instead of opt-in per order.
  Toggle it from the booth form ("Default to walk-up order entry"); when
  on, the live order board auto-opens the walk-up dialog on load instead of
  the QR/menu-first presentation. A new "Set up for an event" entry point
  (`/dashboard/booths/new?mode=event`, alongside "Add your first booth" on
  the empty-board state) pre-checks the toggle and links out to
  `/dashboard/plan` to buy an event pass — reusing the existing pass
  entitlement and walk-up order entry rather than duplicating either.
  Every existing booth defaults to `false`; QR ordering is unaffected.
- Manual Light/Dark/System theme control in the account menu (`@merqo/ui`
  v0.18.0's built-in `AccountMenu` theme switcher), replacing the previous
  OS-only automatic dark mode. `src/app/layout.tsx` now wraps `Providers` in
  next-themes' own `ThemeProvider` (`attribute="class"`, `defaultTheme=
"system"`, `enableSystem`, `disableTransitionOnChange`) instead of the old
  hand-rolled `beforeInteractive` `<Script>` that toggled `.dark` from
  `prefers-color-scheme`; `globals.css`'s existing `.dark` palette is
  unchanged. New `next-themes` dependency (pinned `0.4.6`).
- Vendor-level opt-out for the customer Telegram "order ready" notification:
  a new `customer_telegram_notify_enabled` key on `board_settings`
  (`.default(true)` — every pre-existing vendor row keeps notifying exactly
  as before), a switch next to "Auto-clear after" in dashboard settings, and
  a gate in `advanceOrder` that skips the `notifyCustomer` call only when a
  vendor has explicitly turned it off. A brand-preference control, not a
  consent gate — the customer's own Telegram-connect consent (merqo's,
  see "Customer Telegram connect" below) is untouched.
- Bumped `@merqo/ui` to v0.16.0 and migrated `/dashboard/plan`'s Free/Pass/Pro
  feature-comparison grid onto the new shared `PlanComparisonTable` component,
  replacing the local `FEATURES`-rendering JSX and `Cell` check/dash helper —
  same visible output (column order, check/dash rendering, row order),
  different render path. The shared component (`tiers`/`rows` props, a
  computed `gridTemplateColumns` inline style rather than a Tailwind
  arbitrary-value class) also supports loopkit's 2-tier Free/Pro grid and its
  string-valued cells, for that repo's own separate follow-up migration.
- Customer Telegram connect (Phase B+D): a "Get notified on Telegram" button
  on the order-status page while an order is still waiting (`!isTerminal`
  and not yet `ready`), calling merqo's new `POST
/api/merqo/customer-connect-token`; `advanceOrder`'s `ready` transition
  now fires merqo's `POST /api/merqo/notify-customer` (`notify_ref` mode,
  `` `qkit:${order.id}` ``). No new qkit table or webhook — the customer's
  connection lives entirely in `merqo.customers`, owned by merqo. New
  `src/lib/merqo-customer-notify.ts` HTTP client (bearer
  `MERQO_CUSTOMER_SECRET`) — the first kit → merqo HTTP direction in this
  codebase; fails closed/never throws on either call, so a merqo outage
  never breaks the order-status page or changes `advanceOrder`'s own
  result.
- Telegram order alerts (Phase A): a vendor links Telegram once via a
  deep-link QR in dashboard settings, then gets a message on every new
  order as a redundant channel alongside the live order board. New
  `qkit.vendor_telegram`/`qkit.telegram_link_tokens` tables (migration
  0076), a signature-verified webhook route
  (`/api/telegram/webhook`, `X-Telegram-Bot-Api-Secret-Token`), and a
  fire-and-forget alert wired into `placeOrder` — a failed or missing
  Telegram link never affects order placement itself.
- Optional "Phone number (optional)" field on the customer checkout form,
  next to the name field. When a customer provides one, `place_order`/
  `place_walkup_order` link the order to the shared `merqo.customers` table
  (cross-kit customer identity) so a repeat customer can eventually be
  recognized across kits for the same vendor — genuinely optional, never
  required, and skipped entirely (no merqo write at all) when left blank.
- Bumped `@merqo/ui` to v0.14.0 and switched `DashboardNav`'s `switchKits`
  prop to call the new centralized `getSwitchKits("qkit")` helper instead
  of a locally hardcoded array, so a future new kit only needs adding to
  `@merqo/ui`'s `KIT_FAMILY` registry, not to every kit's own nav wrapper.
  No behavior change — same three sibling kits (loopkit, paykit, stockkit)
  with the same URLs.
- Adopted `@merqo/ui` v0.13.0's `switchKits` prop on `DashboardNav`: the
  account menu now has a "Switch products" submenu listing the three other
  live kits (loopkit, paykit, stockkit), letting a signed-in vendor jump
  straight to another kit's dashboard — SSO via the shared `.merqo.io`
  cookie already signs them in there too, so this is purely an in-product
  navigation affordance, no new backend.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- Cards were visually indistinguishable from the page background in light
  mode — the Market Ochre rebrand set `--card`/`--popover` to the exact
  same OKLCH value as `--background`. Restored a distinct, lighter card
  treatment in light mode (`src/app/globals.css`); dark mode already
  differentiated the two, and got a further brightness bump for better
  contrast.

### Removed

- **qkit's own Telegram bot (Phase A)** — retired the same day it shipped,
  in favor of merqo's shared Telegram bot (Phase A2). Deleted
  `src/app/api/telegram/webhook/`, `src/lib/telegram.ts`, the dashboard
  settings "Connect Telegram" section (`telegram-section.tsx`/
  `telegram-actions.ts`), and the `qkit.vendor_telegram`/
  `qkit.telegram_link_tokens` tables (migration `0077` drops what `0076`
  created); dropped `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`/
  `TELEGRAM_WEBHOOK_SECRET` from `.env.example`. `placeOrder`'s vendor
  order-alert keeps its name/call site but now calls merqo's
  `POST /api/merqo/notify-vendor` (`notifyVendor` in
  `src/lib/merqo-customer-notify.ts`) instead of running a local bot.
  **Any vendor who'd already linked qkit's own bot must reconnect once via
  merqo's `/profile` page** — the user must initiate contact with Merqo's
  bot before it can send private alerts.
  This is an expected, already-approved consequence of the retirement, not
  a regression.

### Changed

- Second-pass frontend-design/impeccable critique, hunting for what the
  first pass missed: the app's dark theme (a full `.dark` palette in
  `globals.css`, contrast-audited as recently as the previous entry) was
  completely unreachable — no theme toggle and no OS-preference detection
  ever applied the `.dark` class, so every `dark:`-variant style in the
  codebase was dead code and vendors got the light theme regardless of
  their device setting, including at night-market events. Root layout now
  applies `.dark` from `prefers-color-scheme` via a `beforeInteractive`
  script (no FOUC) and keeps listening for a live day→night switch. Also
  found the payment-status badge and its "Mark as paid"/"Confirm payment
  received" buttons (`order-card.tsx`, plus the identical duplicated map
  in the landing hero's `landing-ticket.tsx`) using raw `bg-blue-600`/
  `bg-emerald-600` Tailwind colors with no dark-mode pairing, instead of
  this project's own `--status-*` design-token convention — replaced with
  new `--status-payment-claimed`/`--status-payment-confirmed` tokens
  (light + dark). And the global 404 page's copy ("Scan the booth's QR
  code again to start a fresh order") was shown even when a vendor or
  admin hit a stale link inside `/dashboard` or `/admin` (e.g. a deleted
  booth's edit page) — added segment-scoped `not-found.tsx` pages with
  vendor/admin-appropriate copy for those two trees.
- Design pass from a completed frontend-design/impeccable critique: the
  dashboard toolbar's "New order" button is now the visually primary action,
  matching its usage frequency in queue-heavy event mode; removed the
  confusing "The pass" eyebrow above the order board heading (read as a
  plan-tier label, not load-bearing copy); MOAT and pricing cards now use
  the Ticket motif consistently with How-it-works instead of drifting to
  plain bordered divs; the order card's number/name (the most-scanned
  element) is no longer wrapped in a dashed "empty state" border, with the
  bump affordance moved to its own icon chip so reading and acting are
  visually distinct; and the landing trust strip now uses a perforated
  ticket-stub treatment instead of generic pill badges.
- **Bumped `@merqo/ui` to v0.10.0** and wired its new optional
  `LinkComponent` prop (`next/link`'s `Link`) into `dashboard-nav.tsx`'s
  `<DashboardNav>` call site. Previously `DashboardNav`/`AccountMenu` hardcoded
  a plain `<a>` for internal nav, forcing a full page reload on every click —
  root-caused elsewhere in the family as the reason an onboarding tour's
  nav-link spotlight step could abort an unawaited "mark tour seen" write
  mid-flight, so the tour kept re-triggering. `DashboardNav` forwards
  `LinkComponent` down to its composed `AccountMenu` internally, and qkit has
  no standalone `AccountMenu` usage, so this one wiring point covers both.

- **Payments now route through paykit**, the Merqo family's shared payment
  kit, instead of qkit's own local PayNow/QR code. Vendors' "quick add
  PayNow" section now saves to paykit's vendor-scoped config instead of
  writing the full config to `booths.payment`; the customer checkout panel,
  "I've paid" claim, and the vendor's "Confirm payment" tap now all call
  paykit's checkout/claim/confirm API (new `src/lib/paykit/client.ts`) —
  same rendered QR/link/image experience as before. New env vars
  `PAYKIT_KIT_SECRET`/`NEXT_PUBLIC_PAYKIT_URL`. This is a local-only cutover
  for now: paykit hasn't minted a production bearer key for qkit yet, so
  `PAYKIT_KIT_SECRET` ships unset and every payment call degrades to a clear
  error until that key exists. One deliberate feature drop: the customer's
  "Tapped by mistake? Undo" (unclaim) button is gone — paykit has no
  endpoint to reverse a claim.

### Removed

- **`src/lib/payments/`** (the local EMVCo PayNow QR builder and
  pointer/PayNow/Stripe render-adapter) — dead code once the paykit cutover
  above moved checkout rendering to paykit's API.

### Added

- **"Save QR image" on the customer order page's payment panel**, plus
  clearer same-device PayNow instructions. A QR checkout previously had no
  reliable way for the customer to hand the code to a banking app on the
  _same_ phone it's displayed on — this renders the on-screen QR to a PNG
  (`qr-image.ts`'s `renderSvgToPngBlob`) with a real quiet-zone border baked
  in (not just the on-screen wrapper padding, which isn't part of what gets
  rasterized) and shares it via the Web Share API where available, falling
  back to a direct download, with copy pointing the customer at "scan it
  from your photos" in their banking app.
- **`/api/merqo/vendor-provision` endpoint** for Merqo hub push-provisioning —
  lets a vendor one-click-activate qkit from the Merqo dashboard (creates a
  free-tier `vendors` row and seeds the shared vendor profile), guarded by a
  separate `MERQO_PROVISION_SECRET` bearer check (`provisionBearerOk`) since
  it's a write capability, not the read-only metrics secret the sibling
  routes share.
- **"Show wait-time estimate" toggle** on `/dashboard/settings` (default on).
  Off makes the customer status page always show only the queue-position
  label ("2 orders ahead of you"), never a minute guess, regardless of how
  much real order history the booth has — the backup prep-time input
  disables itself while this is off since it would have no effect either
  way (migration `0068`).
- **Arrival confirmation ("hold prep until the customer arrives")**: a new
  per-booth setting, meant for items made fresh per order (ice cream is the
  motivating case), that holds a new order back instead of starting prep
  the moment it's placed. With it on, the customer's order-status page shows
  a big "I'm here, start my order" button; prep only starts once they tap
  it, or a vendor starts it manually from the board. Off by default, and
  walk-up (counter-entered) orders are never held, since there's no
  "customer arrives later" for those.
- **Ready orders now auto-clear after a timeout.** A ticket marked "ready"
  that nobody collects used to sit on the live board forever until a vendor
  manually marked it picked up. Vendors can now set an auto-clear timeout
  (1 to 60 minutes, default 3, or turned off entirely) on the board
  settings page; a forgotten ready order past that timeout completes on its
  own so it stops cluttering the active queue.
- **Restore to ready**, for when the auto-clear above fires too eagerly. On
  the completed-orders history page, an order the auto-clear timeout closed
  (not one a vendor closed by hand) now shows a "Restore to ready" button
  that puts it right back on the live board.
- **Completed-orders history**: the live board drops a ticket the moment
  it's marked picked up, which is right for the active queue but left no
  way to pull it back up. A new `/dashboard/completed` page shows a
  paginated (12/page), newest-first history of a vendor's completed orders
  (capped at the most recent 500) — the same read-only ticket, no action
  buttons since a completed order is terminal.
- **Rotatable booth QR short code**: each booth's QR encodes a short
  `/o/{code}` URL backed by a vendor-rotatable 12-char code. A **Regenerate QR**
  button (behind a booth-naming confirmation) mints a new code, instantly
  invalidating every previously printed/saved link — shutting out stale or
  malicious repeat orders from past events. An unresolved code shows a
  "code expired" screen; the live order-status page stays valid mid-session.
  The short URL (~34 chars vs ~95) scans faster and prints smaller.
  (Supersedes the interim `access_token`/`?k=` model within this unreleased
  cycle — migrations `0027`–`0031`.)
- **Guided onboarding tour**: a short, skippable dashboard tour (driver.js)
  auto-runs once on a new vendor's first visit — spotlighting the live order
  board and the Booths/Stats/Plan landmarks, ending on a "create your first
  booth" nudge. A floating **?** button replays it anytime. Responsive (5 steps
  desktop / 3 mobile). "Seen" is tracked server-side per vendor
  (`vendors.tour_seen_at`, migration `0023`) so it doesn't re-nag across
  devices.
- One-tap **reorder**: customers can repeat a past order from the order-status
  page or their recent-orders list; the cart is rebuilt against the live menu
  (current prices, removed/changed items skipped). Recent-orders list collapses
  to 3 with "Show all".
- **Per-event permanent stats**: a paid pass (license) can be named after the
  event day and its full stats stay viewable forever — ungated, since it was
  paid for (migration `0020` + `set_license_label` RPC).
- **Customer reviews for vendors**: a "Customer reviews" card on `/dashboard/stats`
  shows average rating, distribution, and recent comments **split per booth**,
  each comment timestamped, with "show more" paging (RLS now lets a vendor read
  their own booths' customer feedback). Per-event stats include that event's
  reviews, and a prominent "Feedback" nav button surfaces the qkit feedback page.
- AI harness governance: `docs/constitution.md` (inviolable rules — RLS-is-authz,
  service-role server-only, Zod boundaries, deny-rules-are-a-guardrail).
- Project skills `/security-scan` (local gitleaks + `pnpm audit`) and `/changelog`;
  scoped `allowed-tools` on all project skills.
- pgTAP RLS isolation test (`supabase/tests/rls.test.sql`, run via
  `supabase test db`) — asserts a vendor cannot read or mutate another's data.
- **Refunds reporting.** A confirmed-paid order that's later cancelled is now
  reported as a refund (following the standard gross / refunds / net accounting
  model) instead of silently vanishing from revenue — surfaced on the stats KPI
  band, the `SalesSummaryV1` API, and the CSV export.
- **Vendor social & website links**: vendors can add a website URL plus
  Instagram/Facebook/TikTok links on their profile page — applied by default
  to every booth they own, with an optional per-booth override on that
  booth's own edit page. Shown to customers on the order-status page footer,
  after they've placed an order. Free tier, no plan gate
  (`vendors.social_links`/`booths.social_links`, migration `0052`).
- **Social links also shown on a closed booth's menu page**, inside the
  "not taking orders" banner, so a customer who lands on a closed booth can
  still reach the vendor to ask why instead of hitting a dead end
  (`get_booth_for_order` now resolves and returns `social_links`, migration
  `0053`).

### Security

- **Customer reviews can no longer be forged for a booth you never ordered
  from.** `submit_feedback` accepted a 1-5★ rating against any `booth_id` +
  `order_number` with no proof of an order (the only throttle was a spoofable,
  fail-open per-IP limit), so a booth's public rating could be review-bombed at
  scale. Customer feedback now carries the order's per-order access token, and
  the RPC rejects any review whose `(booth_id, order_number, access_token)`
  doesn't match a real order — the same unguessable token the status page
  already requires. Vendor feedback (stamped from the signed-in id) is
  unchanged. (Migration `0048`.)
- **Closed 7 open high-severity Dependabot alerts**, all transitive
  dev/build-tool dependencies (via eslint/vitest/stryker/next's own postcss
  pipeline), none reachable from runtime app code: `postcss` (path traversal
  in source-map auto-loading), `fast-uri` (host confusion via IDN/backslash,
  2 advisories), `js-yaml` (quadratic-CPU DoS via YAML merge-key chains),
  and `brace-expansion` (exponential-time DoS, 3 separate vulnerable major
  lines). Force-patched via `pnpm-workspace.yaml` overrides, same pattern
  already used for postcss/undici/vite/qs/sharp.

### Fixed

- An order paid online now shows under "Your orders here" on the booth page.
  A payment-required order has no number when it is placed, so it was never
  recorded and a customer who closed the tab on paykit's page had no way
  back to it. It is now recorded at placement with its access token; until it
  has a number the list shows it as "New order" and links to its pay step,
  which forwards a paid order to its status page. The status page fills the
  number in the first time it opens. Recording the same order twice keeps one
  entry.
- Browser-tab title now uses the cross-kit "Name | Tagline" Title Case
  format: "Qkit | Live Queueing" (was "qkit: live queueing"). PWA-chrome
  title updated to match.
- `.husky/lib/pre-commit.sh` used `xargs -d '\n'`, a GNU-only flag not
  supported by BSD xargs (macOS default) — broke every local commit
  touching staged .ts/.tsx/.js/.mjs/.cjs or .json/.md/.css files. Swapped
  for portable `tr '\n' '\0' | xargs -0`.
- **`docs/constitution.md` renamed to `docs/CONSTITUTION.md`** to match
  templateCentral's canonical convention (and every other harness reference
  to it — `AGENTS.md`, `.claude/settings.json`, `.claude/hooks/*`). The
  lowercase filename was a local deviation; `protect-files.sh`'s ask-gate and
  `session-context.sh`'s re-injection now point at the correct case again.
- **Double-spaced button labels ("New order", "Booths · 3/5 open").**
  Both buttons split their label across several elements (an icon, plain
  text, a couple of responsive-hide spans) as direct children of a flex
  container with `gap-2` — the gap applies between every child, so it added
  extra space between words on top of the literal spaces already in the
  text, on the live order board's "New order" and booth-status buttons.
  Each label is now one child instead of several, so the gap only fires
  once, between the icon and the label.
- **Profile page's two-column layout desynced under a tall card.** A raw
  CSS grid tracks row height to its tallest cell, so once "Social &
  website" outgrew "Stall name," every row after it started late in both
  columns, leaving a visible gap under the shorter cards below. Switched to
  two independent stacking columns — the same fix already applied to the
  board-settings page.
- **A free item in an otherwise-priced order showed "$0.00" instead of
  "Free"**, on both the customer order-status page and the vendor live
  board/completed-orders card. Two layers: the UI's price column was gated
  on the order having _any_ priced item, not on the line itself; and
  underneath that, `place_order` coalesced an unset menu-item price to `0`
  and always stored `price_cents` on the order snapshot, so the "genuinely
  free" vs "explicitly $0.00" distinction was already gone by the time the
  order was placed — the UI fix alone had nothing to key off. `place_order`
  now omits `price_cents` entirely for an unset price (migration `0055`),
  mirroring how `cost_cents` already worked.
- **Price/Cost menu-item fields on the booth edit form truncated their own
  placeholder** ("Price (optiona…") — narrowed to "Price (opt.)"/"Cost
  (opt.)" and widened the field slightly.
- **Social link icons now show each platform's real logo and brand color**
  instead of generic Lucide glyphs (TikTok was a plain music-note icon, not
  the TikTok mark). Instagram/Facebook/TikTok now render via Simple Icons
  (`@icons-pack/react-simple-icons`) on a fixed light chip so the marks stay
  legible in dark mode too; used on both the vendor profile form and every
  customer-facing social row.
- **Vendor stats reviews scale with your own data, not the whole platform.** The
  reviews query leaned on RLS alone to scope to your booths and had no
  `feedback(booth_id)` index, so it walked platform-wide customer feedback each
  stats load. It now filters `.in("booth_id", …)` against a new
  `feedback(booth_id, created_at DESC)` index (migration `0049`), and the 500-row
  cap applies to your reviews instead of silently dropping yours past the
  platform's newest 500.
- **More of the UI respects reduced-motion and screen readers.** Under
  `prefers-reduced-motion` the always-on `animate-ping`/`pulse`/`spin` utilities
  (the live board's pulsing "active" dot, skeleton shimmers, spinners) now stop
  looping instead of running for a whole shift. Added missing accessible names:
  the working-hours time inputs (per weekday "opens"/"closes"), the support and
  feedback textareas, the support category radiogroup, and the order-card age
  chip now announces its overdue/aging state instead of conveying it by colour
  alone.
- **The landing page no longer overflows sideways on mobile.** The hero
  order-chit carousel's scroll track had no width constraint, so as a grid child
  (`min-width: auto`) it reported its full four-board width as its minimum and
  stretched the whole document past the viewport — the page rendered ~744px wide
  on a 375px phone, letting you pinch-zoom out and throwing every section's width
  off. Constraining the track with `min-w-0` / `w-full` lets it clip and scroll
  as intended; the document now matches the viewport exactly.
- **Dashboard nav reads clearly on a phone.** The burger and the account avatar
  used to sit crammed together on the right as two look-alike icon buttons. They
  now split to opposite ends — navigation burger far left, account far right
  (the standard hamburger-left / account-right mobile pattern) — with the avatar
  staying visible at every width since it's a high-frequency action. The hero
  order-chit carousel also tightens its padding on small screens and gives its
  dots a comfortable touch target.
- **Subscription revenue isn't double-counted** when an admin re-submits (or
  double-clicks) an already-Pro vendor — the payment is recorded only on a real
  free→Pro transition.
- **Entitlement drift closed.** The booth-create gate (`can_create_booth`)
  checked a license's `expires_at` but not `valid_from`, while serveability
  (`booth_servable`) checked both — so a vendor with a **future-dated** pass
  could create extra booths that then couldn't serve. Both now share one
  `vendor_entitled()` predicate. (Migration 0038.)
- **The anonymous ordering funnel survives an auth outage.** The session
  middleware resolved the user on every request, so a Supabase auth hiccup could
  500 the public `/o` / `/order` pages that need no login. It now resolves the
  user only on protected routes (and degrades to a `/login` redirect instead of
  a 500 if auth is unreachable) — the customer funnel skips the auth round-trip
  entirely.
- **The payment QR now has a fallback** when the image can't load (flaky wifi)
  instead of leaving the customer stuck with no way to pay.
- **Input bounds:** menu prices/costs are capped (a forged price can't overflow
  the order total), the cart is capped at 50 lines, and the status page
  validates its route params — matching the database-side guards.
- **Backend read errors no longer masquerade as empty/expired states.** A DB
  error while placing an order, resolving a booth code, or loading the vendor
  board is now logged and shown honestly — a distinct "try again" screen for a
  code that failed to resolve (instead of "QR expired", which looped a customer
  whose code was valid), and a retry banner on the dashboard (instead of a
  cheery empty "All clear" board that hid in-flight orders).
- **Accessibility:** the customer's live order-status and payment states are
  screen-reader live regions (announces "ready for pickup" / "payment
  confirmed"), and menu option choices expose radio/checkbox semantics instead
  of conveying selection by colour alone.
- **Order-board actions guard against concurrent status changes.** Advance,
  cancel, and confirm-payment updated an order by id using the status they had
  read — so a cancel racing an advance-to-completed could resurrect a cancelled
  order back into revenue and stock. Each update now also matches on the
  read status/payment_status; a concurrent change makes it a no-op and the
  action reports "Order changed — please refresh." rather than clobbering.
- **Dead customer order links resurrected.** Phase A moved the customer entry
  route to `/o/{short_code}` and removed `/order/{boothId}`, but the vendor
  "Copy order link" button, the reorder button, and the status page's "Order
  again" link still pointed at the removed route (404). The copy-link now yields
  the canonical `/o/{short_code}`, and a redirect shim at `/order/{boothId}`
  resolves a booth's current code and forwards to `/o/{code}` — also rescuing any
  previously printed/shared `/order/{boothId}` link. Reorder still seeds the cart
  (its sessionStorage handoff is booth-keyed and survives the redirect).
- **Stock oversell race in `place_order` closed.** The stock gate read remaining
  stock and passed _before_ acquiring the per-booth `order_seq` lock (the sold
  counter is bumped only in an AFTER-INSERT trigger), so two concurrent last-unit
  orders could both pass and oversell. The gate now runs after the lock —
  serializing concurrent orders on a booth — and checks the same pooled,
  clamped quantities the counter applies (one shared `order_item_quantities()`
  rule, replacing three subtly-different clamps). Migration `0034`.
- **Gross margin no longer reads 100% for every no-cost vendor.** `place_order`
  wrote `cost_cents: 0` for every item, even ones with no cost set, so the margin
  stats treated the cost as "present" and reported `profit == revenue` (100%
  margin) on the dashboard, the `SalesSummaryV1.gross_margin` API field, and the
  CSV export. It now omits `cost_cents` for a no-cost item (a genuine cost of 0
  is preserved and still counts). Migration `0033`.
- **`/api/v1/sales/summary` fails loud on a DB read error.** It discarded the
  Supabase `error` on both reads, so a transient failure returned a `200` with
  `{revenue: 0, …}` — a downstream consumer would silently under-invoice. It now
  logs and returns `503` on either read error.

### Security

- **Booth-image storage hardened.** The `booth-images` bucket now enforces a
  size cap and an image-only MIME allowlist at the bucket (previously only the
  client checked), and replacing/removing an image or deleting a booth now
  reclaims the orphaned storage objects instead of leaking them.
- **Vendors can no longer self-escalate to Pro.** `vendors_self_update` was
  row-scoped with no column limit, so a vendor could `UPDATE vendors SET
plan='pro'` on their own row via a direct PostgREST call — a free→pro
  escalation. Column-level `UPDATE(plan)` is now revoked from `anon` +
  `authenticated`; only the admin action (service role) writes `plan`. Same
  migration adds the missing `WITH CHECK` to the `vendors`, `booths`, and
  `purchase_requests` UPDATE policies (a policy with only `USING` doesn't
  constrain the result row, so an update could move a row out of the caller's
  ownership — e.g. re-point a booth to another vendor). Migration `0035`.
- **Order-path hardening extended to the `authenticated` role.** Phase A closed
  the customer write path for `anon` only, but sign-up is open — so any logged-in
  JWT still bypassed all of it: the permissive `orders_public_insert` /
  `booths_public_read` / `feedback_public_insert` policies had no `TO` clause
  (they applied to `authenticated` too) and the Phase-A `REVOKE`s named only
  `anon`. A logged-in vendor could forge orders, read **every** servable booth's
  `cost_cents` + `short_code` cross-vendor, forge competitor reviews, and burn
  any booth's `order_seq`. Migration `0033` drops the three dead permissive
  policies, revokes the direct grants from **both** roles, routes public feedback
  through a new `submit_feedback` `SECURITY DEFINER` RPC (re-derives `vendor_id`
  from the caller's own session), and hardens `place_order` against the
  direct-RPC path that skips the server action: re-derives each item name from
  the stored menu, validates + caps chosen options against the item's option
  groups, rejects an all-zero-quantity cart, caps the line count, and carries a
  booth-scoped flood guard inside the RPC. pgTAP asserts every path is denied to
  a non-owner `authenticated` session.
- **Customer order path enforced in Postgres, not just the app.** Previously the
  public anon key could POST directly to PostgREST and bypass every app-layer
  guard (rate limit, servability, stock, cost snapshot) and read private booth
  columns (`cost_cents`, the QR token). Now two `SECURITY DEFINER` RPCs are the
  only public surface — `get_booth_for_order` (returns a public-safe projection,
  never `cost_cents`/`short_code`) and `place_order` (atomic, server-priced,
  idempotent) — and direct anon `SELECT booths` / `INSERT orders` /
  `EXECUTE next_order_number` are revoked. `place_order` re-prices from the
  stored menu (forged client prices can't survive) and dedupes on an idempotency
  key (no double-order on flaky Wi-Fi). pgTAP encodes the contract.
- **Vendor order path enforced in Postgres too.** The order board mutated orders
  directly from the browser, guarded only by an `orders_vendor_update` policy
  that had `USING` but no `WITH CHECK` and no column restriction — so a tampered
  vendor session (or a direct PostgREST call with the vendor JWT) could forge
  `total_cents`/`items`, rewrite `order_number`/`customer_name`, or re-point an
  order to another booth. Now the three mutations go through validated server
  actions (`advanceOrder`/`confirmOrderPayment`/`cancelOrder`), the update policy
  carries a `WITH CHECK` (result row must still be the vendor's), and a
  `BEFORE UPDATE` trigger freezes the financial/identity columns (`booth_id`,
  `order_number`, `customer_name`, `items`, `total_cents`, `created_at`,
  `idempotency_key`, `payment_method_kind`) — a vendor UPDATE may only move the
  state machine. Migration `0032`; pgTAP encodes the freeze + `WITH CHECK`.
- CI security scanning (`.github/workflows/security.yml`): gitleaks v3 secret
  scan, CodeQL (javascript-typescript, security-extended), and a `pnpm audit`
  high/critical gate.
- `.github/dependabot.yml`: security-updates only (npm + github-actions);
  version-update PRs disabled (`open-pull-requests-limit: 0`).
- Removed `axios` — an unused production dependency carrying a high-severity
  `form-data` advisory (GHSA-hmw2-7cc7-3qxx). Production `pnpm audit` is clean at
  the high gate. The audit gate runs `--prod` (shipped code); a full audit runs
  informationally (dev-toolchain transitive vulns tracked by Dependabot).

### Changed

- Migrated git hooks from lefthook to husky — lefthook's unsigned
  `lefthook.exe` is unconditionally blocked by Windows Smart App Control on
  this machine; husky has no native binary. Same checks, same rigor.
- **Profile page column order**: column 1 is stall name → profile picture →
  change password; column 2 is display name → social links (was social
  links above display name). Meant as the standard profile-page order
  across every kit, not just qkit.
- **Completed-orders history now defaults to "Today"** instead of "All
  time" — a vendor lands on today's picked-up orders instead of scrolling
  through their entire history first. The cutoff comes from a server-
  computed SGT day-start rather than each device's own local clock, so it
  can't drift by hours if the vendor's browser timezone differs from the
  server's.
- **Daily order-number reset now defaults on, for every vendor, and the
  display number is zero-padded to 3 digits.** The board and customer
  status page show a small daily-reset ticket number (e.g. #003, was a bare
  "3") instead of the permanent one (#0847) by default now, matching how
  event/pop-up food-booth counters commonly number orders — previously off
  by default (migration `0067`, applied to existing vendors too, not just
  new ones). Grows past 3 digits rather than truncating on a heavy day, same
  never-shrink convention as the permanent number's own padding. Display-
  only: the real, permanent `order_number` is unaffected either way, and a
  vendor can still turn it off from `/dashboard/settings`.
- **Brand name standardized to lowercase `qkit`** across prose, UI copy, aria-labels,
  and docs (was inconsistently "QKit"/"Qkit" in ~87 files) — matches the sibling
  kits (`loopkit`) and the Merqo dashboard's kit registry. The navbar/hero/footer
  logo mark keeps its stylized two-tone "QKit" wordmark (unchanged, intentional —
  a visual mark, not prose). The footer now also credits "a Merqo kit".
- **Performance:** the customer status page fetches its order + booth in one
  round-trip instead of two; the dashboard's auth + vendor lookups are memoized
  per request (a layout + page no longer double-fetch); the DB rate limiter is
  indexed and sweeps only occasionally instead of on every call; and the two
  customer pollers share one visibility-aware hook.
- **Removed `pino`** (+ `pino-pretty`) — an unused dependency (26 packages
  pruned). A root `global-error` boundary now renders a styled page when the
  root layout itself throws.
- **CI** now applies every migration and runs the pgTAP RLS suite, and runs a
  production `next build`, on each push/PR.
- Mobile "order ready" alerts now work. Sound: a single shared, gesture-unlocked
  AudioContext (reused, await-resumed) replaces the per-call context that stayed
  silent on iOS/Android; the customer page always shows an "Alert me" tap so
  audio unlocks even on iOS Safari (no Notification API). Notifications: shown via
  a minimal static service worker (`registration.showNotification` — the page-
  level constructor is illegal on Android Chrome), fixing Android. The app is now
  an installable PWA (`manifest.ts` `display: standalone` + generated icons), so
  iOS notifications work once added to the home screen.
- Vendor image uploads are resized + re-encoded to **WebP in the browser** before
  upload (banner ≤1600px, product ≤1000px) so storage and load stay fast; source
  cap raised to 15 MB since we compress. Accepted formats (JPEG/PNG/WebP) are now
  stated on both uploaders. The customize sheet shows the item photo at the top.
- Mobile dashboard nav collapses behind a **burger menu** (the bar overflowed on
  phones); the vendor NPS form is now an even 0–10 scale that fits any width.
- Customer menu photos are **tap-to-enlarge** (fullscreen lightbox, Esc/tap to
  close) with a subtle corner expand icon + zoom-in cursor as the affordance.
- "Get a pass" / "Go monthly" now file an in-product **upgrade request** to the
  admin (migration `0021` + `purchase_requests`) instead of opening a `mailto:`
  to a personal inbox. The admin Overview shows a pending-requests inbox with a
  Resolve action; granting a pass/Pro auto-resolves the vendor's request.
- Pagination everywhere (new reusable `Paginated`): admin tables (vendors, audit
  log, per-vendor CSAT) get prev/next pages; feeds (recent orders, reviews, NPS
  notes) get "Show more / Show less". Every expander now collapses back. Per 2026
  UX consensus (pagination for tables, load-more for feeds).
- Reorder lives only on the order page (not the recent-orders list): the list
  shows no items to reorder _from_, and this also removes the inconsistency where
  only orders placed after the snapshot feature had a reorder button.
- Admin revamp: tabbed into **Overview · Vendors · Feedback** (vendors moved to
  their own tab). Cards adopt qkit's ticket/receipt motif (perforated hero,
  Space Mono figures, staggered reveal). Overview adds a **GMV** card (customer
  spend flowing through booths — the marketplace's throughput). Admin **feedback**
  drops the raw per-order customer feed (vendor-facing); it tracks **vendor NPS**,
  an **aggregate platform CSAT**, and a **per-vendor CSAT breakdown** (worst-rated
  first) to surface ordering-quality issues — scores only, no raw reviews.
- Vendor → qkit feedback is **NPS** (0–10 "recommend qkit?") instead of 1–5
  stars (migration `0019` adds the `nps` column).
- Fixed the stats/admin trend chart: dated X-axis (was a hidden index) and an
  uncut Y-axis (was clipped by a negative margin + 28px width).
- Permissions are now max-privilege: bare-tool `allow` so routine work doesn't
  prompt, with a `deny` list scoped to secret reads/edits and irreversible git/fs
  ops (force-push, hard reset, `rm -rf`, history rewrite). `.env.example` is the
  only whitelisted env file.
- De-branded docs layout: `docs/superpowers/{specs,plans}` → `docs/{specs,plans}`.
- Upgraded Next.js 15 → 16.2.7 (Turbopack). Renamed `src/middleware.ts` →
  `src/proxy.ts` (`export proxy`); switched the `check` script from `next lint`
  (removed in 16) to the ESLint CLI with `eslint-config-next`'s flat config.

## [0.1.1] - 2026-08-27

### Added

- New cross-kit endpoint `GET /api/merqo/vendor-activity?email=` for merqo's
  admin vendor-detail page: bearer-authed (`MERQO_METRICS_SECRET`, same
  secret as `/api/merqo/metrics`), resolves the vendor by email and returns
  `{active, plan, status, metrics, lastActivityAt}` — `status` reuses
  `admin-vendor-health.ts`'s exact `VendorStatus` triage (the same one the
  admin console renders), `metrics` is `"Orders (30d)"`/`"Revenue (30d)"`/
  `"Booths"`. 404s when the vendor has no `vendors` row at all (never
  touched qkit); a known-but-inactive vendor isn't a case qkit's data model
  produces past that point, so `active` is always `true` once past the 404
  gate. Pure aggregation lives in `computeVendorActivity`
  (`src/lib/merqo-vendor-activity.ts`); see
  `docs/business/2026-08-26-cross-kit-vendor-activity-design.md` (outside
  this repo) for the shared cross-kit contract.

## [0.1.0] - 2026-06-05

### Added

- Supabase email/password auth — login and register (creates the vendor row).
- Database schema (`supabase/migrations/0001_initial_schema.sql`): `vendors`,
  `booths` (JSONB `menu_items`), `orders` (JSONB `items`, `order_status` enum),
  with `updated_at` trigger.
- Row Level Security: vendors see/edit only their own booths and orders; active
  booths are publicly readable; anyone may place an order.
- Supabase realtime publication on `orders`.
- Vendor dashboard (`/dashboard`) — realtime order board; tap a card to advance
  status; auth-guarded via `src/middleware.ts`.
- Customer ordering page (`/order/[boothId]`) — menu, cart, and `placeOrder`
  server action with order-number generation.
- Live order status page (`/order/[boothId]/[orderNumber]`) with a realtime
  status poller (reads via the service-role client).
- shadcn/ui (new-york) primitives; `cn` / `formatPrice` / `genOrderNumber` utils
  with tests.
- AI harness: `AGENTS.md`, `.claude/` (settings hooks, project skills, verify
  gate, manifest), `vitest.config.ts`.

### Changed

- Upgraded `@supabase/ssr` 0.6 → 0.10 for `@supabase/supabase-js` 2.107 type
  compatibility (older ssr made every typed query resolve to `never`).

[Unreleased]: https://github.com/merqo-io/qkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/merqo-io/qkit/releases/tag/v0.1.0
