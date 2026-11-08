# Data model detail

Moved from `AGENTS.md` (context diet). A short summary stays in `AGENTS.md`; this file keeps the dated history and integration detail.

## Schema and integrations

- **Payments route through paykit** (a sibling kit; see
  `../paykit/AGENTS.md`) as of the 2026-08-11 cutover — see "paykit checkout
  cutover" in Project-Specific Notes below. `booths.payment` (JSONB) and
  `orders.payment_status` (enum) are unchanged schema-wise and still written,
  but `booths.payment` now holds only a minimal `{kind}` marker (the full
  PayNow/pointer config lives in paykit's `vendor_payment_config`, vendor-
  scoped) and `orders.payment_status` is a local mirror of paykit's
  transaction state, not the primary record.
- **`booths.paykit_booking_id`** (migration 0083, 2026-08-26): nullable
  text, event-mode booths only (see `walkup_default`, `0080`) — a vendor-
  pasted link to a booking they created in paykit's own `bookings` table
  (`paykit/AGENTS.md`'s Data model section). Unvalidated at write time,
  same trust level as the "quick add PayNow" config section — no lookup or
  matching by name/phone (qkit stores no customer phone on orders at all).
  Read back read-only via paykit's `GET /api/v1/bookings/{booking_id}`
  (`getBookingStatus`, `src/lib/paykit/client.ts`) to show live deposit/
  balance status on the booth edit page (`BookingStatusSection`).
- **Vendor Telegram alerts, Phase A → A2** (2026-08-16): Phase A shipped
  qkit's own per-kit Telegram bot (`vendor_telegram`/`telegram_link_tokens`
  tables, a webhook route, a dashboard settings section) for vendor
  new-order alerts. Phase A2, shipped the same day, **retires all of it** —
  a vendor shouldn't hold two unrelated "talking to Merqo" bot connections
  once merqo has its own shared bot (`POST /api/merqo/vendor-connect-token`,
  `POST /api/merqo/notify-vendor`). Migration `0077` drops both `0076`
  tables; `placeOrder`'s vendor alert (`notifyVendorTelegram` in
  `src/app/o/[code]/notify.ts`) now calls `notifyVendor` in
  `src/lib/merqo/customer-notify.ts` instead of a local lookup + Bot API
  call — same name, same call site, same never-blocks-order-placement
  guarantee, only the internals changed. No connection data carried over: private chat IDs identify the same
  Telegram user across bots, but the user must initiate a conversation with
  each bot before it can message them. Vendors who linked qkit's retired bot
  must reconnect once via merqo's own `/profile` page. The superseded Phase
  A design lives on as history at
  `docs/superpowers/specs/2026-08-16-telegram-order-alerts-design.md`; the
  current design is
  `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.
- **Customer Telegram connect** (2026-08-16, Phase B+D of the cross-kit
  Telegram integration design): a new architectural direction — this is the
  first **kit → merqo** HTTP call in this codebase (every existing cross-kit
  call up to this point flows merqo → kit, e.g. metrics pull,
  vendor-provision). No new qkit table, no new webhook — the customer's
  Telegram connection lives entirely in `merqo.customers`, owned by merqo.
  `src/lib/merqo/customer-notify.ts` calls merqo's bearer-secret
  (`MERQO_CUSTOMER_SECRET`) `POST /api/merqo/customer-connect-token` (mints
  a deep-link token, rendered by the order-status page's `TelegramConnect`
  component while an order isn't yet `ready`) and `POST
/api/merqo/notify-customer` (fired from `advanceOrder`'s `ready`
  transition, `notify_ref` mode, `` `qkit:${order.id}` ``). Both fail
  closed/never throw — a merqo outage never breaks the order-status page or
  changes `advanceOrder`'s own result. See
  `docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`.
- **Customer notify vendor toggle** (2026-08-16, fast-follow on the above):
  `boardSettingsSchema` (`src/lib/schemas.ts`) gained one more
  `board_settings` key, `customer_telegram_notify_enabled:
z.boolean().default(true)` — a vendor-side opt-out for the `ready`-transition
  Telegram ping, distinct from the customer's own consent above (which this
  never touches). `advanceOrder` (`src/app/dashboard/order-advance-actions.ts`)
  reads+parses the vendor's `board_settings` via a new
  `customerNotifyEnabled` helper before firing `notifyCustomer`, skipping
  the call only on an explicit `false`; an unparseable/missing row (every
  vendor whose row predates this key) fails open. Surfaced as a `Switch`
  next to "Auto-clear after" in dashboard settings
  (`src/app/dashboard/settings/settings-form.tsx`). See
  `docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`.

## Project notes

**paykit checkout cutover (2026-08-11):** qkit's local PayNow QR builder and
payment-config UI were previously self-contained (`src/lib/payments/`,
`booths.payment`, `orders.payment_status`); this cutover (explicitly
authorized — see the design precedent in paykit/AGENTS.md's "later, separate
cutover spec" note, now acted on) replaces the actual checkout mechanics with
calls to paykit's `/api/v1/*` HTTP API (`src/lib/paykit/client.ts`):
vendor PayNow/pointer config now saves to paykit's vendor-scoped
`vendor_payment_config` (`dashboard/booths/actions.ts`'s `saveBooth`, still
surfaced through the unchanged `PaymentSection` UI), and the customer
checkout render + claim + vendor confirm (`order/[boothId]/[orderNumber]/
page.tsx`+`payment-actions.ts`, `dashboard/order-payment-actions.ts`'s
`confirmOrderPayment`) call paykit's `createCheckout`/`claimCheckout`/
`confirmCheckout`. `src/lib/payments/` (the local EMVCo QR builder +
render-adapter) is deleted — nothing reads/writes the full `booths.payment`
config shape anymore. Two things deliberately were **not** changed, per this
cutover's own scope:

- `booths.payment` still gets a minimal `{kind}` write (see
  `paymentMarker` in `booths/actions.ts`) — `qkit.place_order` and
  `qkit.place_walkup_order` (SQL, migrations 0056/0060-61, out of scope for
  this cutover) still read `booths.payment->>'kind'` to decide a new order's
  initial `payment_status`, and there's no SQL-side way to ask paykit
  instead without a further migration.
- `orders.payment_status` stays qkit's local mirror, written after a
  successful paykit call, not replaced — the rest of the order-lifecycle
  logic that depends on it (cancel-blocking and explicit payment confirmation in
  `confirmOrderPayment`, the realtime board) is unaffected by this cutover.

**Fulfillment/payment separation (2026-10-09):** the August cutover retained
local auto-confirmation on pickup. The audit supersedes that behavior:
`buildAdvancePatch` and fulfillment undo now modify only fulfillment state.
Only explicit Paykit-backed confirmation updates the payment mirror; completed
unpaid orders retain a settlement action. See
`docs/meta/2026-10-09-qkit-fulfillment-payment-isolation-review.md`.

**Follow-up gaps closed (2026-08-12):** paykit added an unclaim endpoint and
started returning full config fields on its vendor-config GET; qkit's side
of both fixes landed together — the customer's "Tapped by mistake? Undo"
affordance is back on `pay-panel.tsx` (`unclaimPayment`/`unclaimCheckout`,
same paykit-is-source-of-truth pattern as `claimPayment`), and re-opening the
booth-edit Payment section now prefills from paykit's
`GET /api/v1/vendors/{id}/config` (`getVendorConfig` in `paykit/client.ts`)
instead of starting every text field blank — the `{kind}`-only marker is now
only a degrade-path fallback (`initialPaymentFromMarker` in
`dashboard/booths/[boothId]/page.tsx`) for when that call fails.

`PAYKIT_KIT_SECRET` is set on qkit's Production and Preview environments,
matching the key paykit's own `AGENTS.md` records minting for qkit during
this cutover — not independently re-verified against a live checkout
here, so treat a real checkout failure as a genuine regression to
investigate, not evidence the key was never set.

**Preview OAuth break, `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` env-scope gap
(2026-08-13):** Google login on preview deploys was failing
(`/login?error=oauth`) because Vercel had `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=
.merqo.io` (from the 2026-08-02 cross-kit SSO work) scoped to Preview as
well as Production, contrary to `.env.example`'s own comment. A
`Domain=.merqo.io` cookie is silently rejected by the browser on a
`*.vercel.app` host, so the PKCE `code_verifier` cookie never got written
and `exchangeCodeForSession` (`src/app/auth/callback/route.ts`) failed
locally with no network call and no log — fixed by adding an error log on
that branch and rescoping the Vercel env var to Production-only. Full
writeup: `docs/DEPLOY.md`'s new "Production vs Preview environment
variables" section. Deliberately **not** doing yet, per user decision same
day: splitting Preview onto a separate staging Supabase project — Preview
and Production still share one Supabase project; revisit later, not
urgent.

**Vendor Telegram alerts, Phase A → A2 (2026-08-16):** Phase A (a vendor
connects qkit's own Telegram bot once via a deep-link QR in dashboard
settings; a webhook route verifies Telegram's
`X-Telegram-Bot-Api-Secret-Token` before touching any data) shipped and was
retired the same day by Phase A2, once the sibling merqo repo shipped a
shared bot every kit calls into instead of running its own. `placeOrder`
(`src/app/o/[code]/notify.ts`'s `notifyVendorTelegram`) still fires a
redundant new-order alert to the booth's vendor, entirely best-effort and
wrapped so a failure can never affect order placement itself (tested
explicitly, not just claimed — see `actions.place-order.test.ts`'s "vendor
alert" block) — only its internals changed, from a local
`vendor_telegram`/Bot API call to `notifyVendor` in
`src/lib/merqo/customer-notify.ts`. See the Data model section above and
`docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.
Distinct from, but sharing the same underlying-bot concept as, the
still-draft customer-facing
`2026-07-18-vendor-notification-channels-design.md` (not built here).
