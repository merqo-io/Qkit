# lib

## Purpose

Business rules, validation, database types and server/browser integration helpers
for qkit. Pure helpers accept data and clocks from callers and can be tested
without a DOM or database. Browser alerts, React icon rendering, Supabase clients
and cross-kit HTTP/RPC adapters retain their own platform dependencies.

## Contents

- `action-result.ts` — `ActionResult<T>` discriminated union
  (`{success:true}&T | {success:false,error}`) returned by every Server Action.
- `allergen-icons.ts` — `ALLERGEN_ICONS: Record<AllergenTag, string>`, an
  emoji per `ALLERGEN_TAGS` value. Moved here 2026-09-01 (was
  `dashboard/booths/allergen-icons.ts`) once the customer-facing
  `components/allergen-badges.tsx`/`item-customizer.tsx` needed the same
  icon set — a shared `lib/` module rather than a dashboard-scoped one
  reaching across into `components/`. Rendering-only, no schema/data-model
  change.
- `brand-icon.tsx` — `brandIcon(size)` React element plus `BRAND_KHAKI`/
  `BRAND_OAT` color constants; renders the "Q" app mark for `ImageResponse`-
  generated favicon/manifest/apple-touch icons.
- `carousel.ts` — `nearestIndex(scrollLeft, boardWidth, count)`: clamped
  nearest-board-index calculation for a horizontally-scrolling carousel.
- `carousel.test.ts` — tests clamping and the non-positive-width edge case.
- `availability.ts` — what a customer can still add to a basket, parsed from
  `booth_availability` (migration `0096`): `parseAvailability`, `hasLimits`/
  `holdsApply`, `addBlock` + `addBlockMessage` (why one more of an item cannot
  go in: the item's stock, the booth's daily total, or the per-order limit,
  each told apart from "held in another basket"), and `fitCart` (cuts a basket
  to what is available, trimming from the end). Display and courtesy only;
  `place_order` and the cap triggers are the real limits.
- `availability.test.ts` — tests parsing, each block reason and its order of
  precedence, the messages, and trimming.
- `cart-storage.ts` — `saveCart`/`loadCart`/`clearCart`: persists the
  in-progress customer cart to `sessionStorage` (keyed `qkit:cart:{boothId}`)
  as compact `ReorderLine`s, validated on read via `isValidLine`; best-effort
  (silently no-ops without `window` or on quota/private-mode errors).
  `holdSessionId(boothId)` is the random id the tab's basket holds stock under
  (`qkit:hold:{boothId}`), kept across a refresh so a customer never sees
  their own held items as someone else's.
- `cart-storage.test.ts` — tests save/load/clear round-tripping and malformed
  or missing storage.
- `pending-order.ts` — per-booth session replay key and canonical SHA-256 payload
  digest for recovering uncertain orders after reload, without plaintext customer
  details. Storage access failures are distinguished from corrupt metadata so
  initial ordering remains available with a keep-page-open warning.
- `pending-order.test.ts` — recovery metadata isolation, payload normalization,
  corrupt data rejection and unavailable storage regressions.
- `daily-order-number.ts` — `firstOrderNumberToday(client, boothId)`: the
  booth's first `order_number` of the SGT day, the baseline
  `displayOrderNumber` ranks against. `vendorFacingOrderNumber(client,
vendorId, boothId, orderNumber)`: the day's rank when the vendor has daily
  numbering on, the permanent number otherwise. One query for every server
  path that shows a single booth's ticket number (status page, TV display,
  printed label, Telegram alert), which each used to carry their own copy.
  `firstOrderNumbersToday(client, boothIds)` is the same baseline for many
  booths at once, keyed by booth id: the order board and the Completed page.
- `daily-order-number.test.ts` — the first order found, none today, the SGT
  day window, and `vendorFacingOrderNumber` with daily numbering on, off,
  unreadable settings, and no order yet today.
- `cart.ts` — `cartKey(menuItemId, options)` (stable dedup key sorted by
  option group so selection order doesn't matter) and `cartTotal`.
- `cart.test.ts` — tests cart-key stability and total summation.
- `env.ts` — `publicEnv`: fail-fast validated `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, client-safe (no secrets), read via
  literal `process.env.NEXT_PUBLIC_*` so Next.js still inlines them at build.
- `events.ts` — `eventLabel(license)`: display name for a paid pass/event
  (vendor's own label, or a dated default like "Pass · 7 Jun").
- `events.test.ts` — tests label fallback and whitespace-only-label handling.
- `hours-editor.ts` — pure state transitions behind the working-hours editor:
  `WEEKDAY_KEYS`, `DEFAULT_WINDOW`, `emptyWeek`, `dailyHours`, `weekFromDaily`,
  `dailyFromWeek` — the daily↔weekly conversions, kept out of the component so
  they're unit-testable without a DOM.
- `hours-editor.test.ts` — tests the daily/weekly conversion helpers.
- `hours.ts` — `BoothHours`/`DayWindow` types and `isBoothOpen`/
  `nextOpenLabel`: SGT wall-clock open/closed logic including overnight
  windows (`eveningCovers`/`morningCarry` carry a Fri 22:00–02:00 shift past
  midnight).
- `hours.test.ts` — tests daily/weekly/overnight open-closed logic and the
  "Opens …" label.
- `image-upload-adapter.ts` — `uploadQkitImage`: `@merqo/ui`'s `ImageUploader`
  `onUpload` backend — writes the already-resized blob to the `booth-images`
  Supabase Storage bucket at the path the component built
  (`${pathPrefix}/${uuid}.${ext}`, `pathPrefix` set to the vendor id at each
  call site) and resolves the public URL; throws on a storage error so
  `ImageUploader` surfaces it via its own `onError`. A plain function, not a
  factory — every call site's vendor id is already baked into `path` by the
  time `onUpload` runs, so there's nothing left to close over.
- `image-upload-adapter.test.ts` — tests a successful upload/public-URL
  round trip and that a storage error propagates as a rejection.
- `legal-gate.ts` — `checkLegalAcceptance(email)` and its guard companion
  `requireCurrentLegalAcceptance(email)`. qkit owns no legal-acceptance
  record (merqo does), so checking currency is a bearer-authed
  `GET /api/merqo/legal-status` call, its result compared against
  `@merqo/ui`'s `LEGAL_VERSIONS` via `isLegalCurrent` and cached in the
  `legal_check_state` TTL table (5 min) — the same throttle pattern as
  merqo's `vendor_sync_state`, since the check runs on every gated dashboard
  render. **Fails closed**: a missing `MERQO_CUSTOMER_SECRET`, an unreachable
  merqo, a non-2xx, or a malformed body all resolve to "not current", which
  `requireCurrentLegalAcceptance` turns into a `redirect("/legal/accept")`.
  Wired into `requireVendor`/`requireEntitledVendor` (`supabase/`) and
  `dashboard/layout.tsx`.
- `legal-gate.test.ts` — covers the TTL cache short-circuit (no fetch within
  the window), the re-check-and-cache path, a stale/out-of-date accepted
  version, and every fail-closed branch (network error, non-2xx, missing
  secret).
- `menu-csv.ts` — `menuItemsToCsv(items)`/`csvToMenuItems(text)`/
  `optionGroupsFromCsvChoices(choices)`: the qkit-side of the menu-manager's
  CSV bulk export/import, 10 fixed columns —
  `name,description,price,cost,available,group_name,group_type,choice_label,choice_price,choice_code`
  (`choice_code` is the choice's short code on the order ticket, at most
  `OPTION_CODE_MAX` characters; it is last so a file exported before it
  existed still imports unchanged, and a blank cell leaves the choice printing
  in full)
  (`cost` added 2026-09-01, the item's own private `cost_cents`; the last 4
  customization columns added the same day; dollars not cents for
  spreadsheet readability; choice-level cost delta and allergens are
  deliberately excluded — both live behind "Advanced" in
  `option-groups-editor.tsx`, out of CSV scope per the design doc). A hand-
  rolled RFC4180-shaped encode/decode (quoted fields, embedded commas/
  quotes) rather than a new dependency; preserves LF, CRLF and CR newlines
  inside quoted fields. An item row has `name` filled; a choice row has
  `name` blank and `group_name`/`choice_label` filled, attached to the item
  row immediately above it (continuation rows) — consecutive choice rows
  sharing a `group_name` form one group, a `group_name` change starts a
  new group under the same item. `csvToMenuItems` always treats the first
  line as the header (skipped) and returns one `CsvMenuRow` (with a nested
  `choices: CsvChoiceRow[]`) per item row, via the shared `parseDollarField`
  helper (blank is valid/unset, negative or non-numeric is an error instead
  of a silent drop) for `price`/`cost`/`choice_price`. Every error string
  embeds its own real spreadsheet row number (header = row 1), computed
  once here rather than by the UI, so nesting choice rows under their item
  doesn't break a flat array-index-based row number. `optionGroupsFromCsvChoices`
  turns a flat `CsvChoiceRow[]` (errored rows skipped) into `OptionGroup[]`
  with fresh ids — `menu-manager.tsx`'s `commitImport` calls it only when a
  row has at least one valid choice, otherwise leaving a name-matched
  existing item's `option_groups` untouched. `menuCsvTemplate()` returns
  the same header plus two example item rows (one with a blank price and
  cost, one with both set), no example customization rows — a vendor with
  no items yet had no way to see the expected column format before this,
  since `menuItemsToCsv([])` is just a bare header line with nothing to
  copy from.
- `menu-csv.test.ts` — round-trip encode/decode (including a
  comma-containing description through the quoting path, cost alongside
  price, and continuation rows for a group's choices), header skipping,
  missing-name/invalid-or-negative-price/invalid-or-negative-cost row
  errors, blank-price-or-cost-is-not-an-error, the `available` default
  (true unless the cell is exactly `false`), empty/header-only input,
  choice-row attachment/grouping (consecutive same-`group_name` rows,
  a `group_name` change starting a new group, `group_type` any/one,
  missing-group-or-item-above errors, invalid choice price), and
  `optionGroupsFromCsvChoices`'s grouping/multiple-mapping/errored-row-
  skipping/fresh-id behavior. Confirms `menuCsvTemplate()`'s own output
  round-trips through `csvToMenuItems` with no error rows and no example
  customization rows.
- `menu-sections.ts` — `groupByCategory(items, categories)`: pure grouping
  of a booth's `menu_items` under its `menu_categories` (booth's own order),
  bucketing any missing/unmatched category id into "Other", always last, and
  dropping empty sections — used by `OrderForm` to render the customer menu
  grouped once a booth has 2+ non-empty sections. Both inputs were schema/
  type-only with no vendor UI to actually populate them until
  `dashboard/booths/menu-editor.tsx`'s section management/picker shipped
  (2026-09-02) — this function itself is unchanged.
- `menu-sections.test.ts` — tests category-order grouping, the Other bucket,
  empty-section dropping, and the no-categories-defined case.
- `nps.ts` — `npsBreakdown(scores)`: Net Promoter Score classification
  (promoters 9-10 / passives 7-8 / detractors 0-6) and the -100..100 score.
- `nps.test.ts` — tests the breakdown math and the empty-responses case.
- `order-alerts.ts` — customer/vendor "order ready"/"new order" alerting:
  `isNotifySupported`/`notifyPermission`/`requestNotifyPermission`,
  `fireReadyNotification`/`fireNewOrderNotification` (service-worker
  `showNotification` with a page-level `Notification` fallback),
  `unlockAudio` + `playReadyChime`/`playSound` (a shared, gesture-unlocked
  `AudioContext` playing one of five square-wave presets — chime/bell/ding/
  horn/triple — via WebAudio oscillators). Audio unlock failures are contained
  so browser restrictions cannot interrupt a customer or vendor gesture.
- `order-alerts.test.ts` — tests permission gating, notification dispatch
  fallback, sound-preset scheduling and synchronous/rejected audio-resume
  failures against mocked WebAudio/Notification APIs.
- `orders.ts` — order-board core: `BOARD_ORDER_COLUMNS` (explicit column list
  excluding `access_token`), `TERMINAL_STATUSES`/`isTerminal`, `ADVANCE` (legal
  forward-status map + button label), `orderAgeTone`/`elapsedMinutes`/
  `elapsedLabel` (minutes, then hours, then days past two days),
  `overtakenOrderIds(orders)` (ids of in-progress orders that a later order from
  the same booth has already overtaken, compared on `created_at` and scoped per
  booth: the board badges these, since an order nobody marked while later ones
  went out leaves its customer waiting on a screen that never changes),
  `buildAdvancePatch` (fulfillment status and timestamp patch, without payment
  writes), `sortActiveOrders` (vendor-board display sort,
  status-agnostic by design — a bumped order leads, then every order by
  `created_at`; takes an `AgeSortOrder`, `"earliest"` default or `"latest"`),
  `ordersAheadOf` (the separate, status-aware kitchen-priority queue used
  for the customer-facing wait estimate), `estimateLabel`/`estimateRangeLabel`
  (point vs. range "X-Y min" customer wait-estimate labels — the range form
  is what the order-status page actually renders, on the theory that an
  unmet precise promise erodes trust more than an upfront-honest range),
  `queuePositionLabel` (the no-time-data fallback, "N orders ahead of you"),
  `ORDER_STAGES` + `orderStageIndex` (the customer page's four stages, Received, Preparing, Ready, Collected; Ready and Collected are separate so a collected order never reads as one still waiting, pending and confirmed both sit on Received, and a cancelled order is off the track at -1), `displayOrderNumber`
  (board_settings.daily_order_number_reset's display-only "position among
  today's orders" number — pure arithmetic on the immutable `order_number`/
  `created_at` relative to a caller-supplied baseline, never a live recount;
  zero-padded to 3 digits like a ticket counter ("003"), growing past that
  rather than truncating; falls back to the real number when there's no
  baseline, or when the rank would be non-positive because the order predates
  the baseline), `isStaleOrderView(createdAt, nowMs)` + `STALE_ORDER_VIEW_HOURS`
  (whether an order-status page is being viewed more than 12 hours after the
  order was placed, which is how a browser-restored URL from a repeat
  customer's earlier visit shows up; 12 hours rather than the SGT day boundary
  so a late-night order checked after midnight is not called stale),
  `needsPaymentReview(status, paymentStatus)` (pure: whether a
  still-`pending` order with an outstanding payment claim needs
  `OrderCard`'s merged "Mark paid & start" review action instead of separate
  confirm-payment/advance buttons — keyed on order state, not `order.source`,
  so a walk-up order gets it too), `splitTrailingDigit(orderNumber)` (pure
  string split into `{lead, last}` so a vendor's physical pickup-shelf-slot
  system, keyed off an order's last digit, can have that digit visually
  emphasized wherever the number is shown — `OrderCard`, the TV/queue
  display; `null` in, both fields empty out, for an order still awaiting a
  payment claim with no number assigned yet).
- `orders.test.ts` — tests status transitions, fulfillment-only patch-building,
  sorting, age/label formatting,
  `displayOrderNumber`'s baseline arithmetic, 3-digit padding/growth and
  real-number fallbacks, `splitTrailingDigit`'s lead/last split (including
  the single-character and `null` edge cases), and `needsPaymentReview`'s
  pending/payment-status matrix.
- `paykit/` — server-only HTTP client for paykit's `/api/v1/*` checkout API
  (vendor config upsert + full read-back, checkout create/claim/unclaim/
  confirm/status); see its own README. Replaced the local PayNow QR builder
  and payment-method adapter registry that used to live at `payments/`
  (deleted in the paykit cutover).
- `plan.test.ts` — tests entitlement resolution across plan/pass/pro
  combinations and the `canAdd*`/`canHaveOptionGroups` gates.
- `payment-marker.ts` — everything that reads or writes the `{kind}` marker
  on `booths.payment`: `paymentKindOf(data)` (the stored kind, or null),
  `expectsPayment(kind)` (false for null), and `paymentMarker(kind)` (what to
  store for a booth of that kind). It parses with `paymentMarkerSchema`.
  `stripe`, which SQL's check still allows and nothing ever stored, reads as
  no payment.
- `payment-marker.test.ts` — each kind read from a marker and from a full
  config, null for anything else (`stripe` included), and a round trip.
- `plan.ts` — `Entitlement`/`Tier` model (`FREE`/`PASS`/`PRO` presets),
  `getEntitlement` (resolves a vendor's effective entitlement from
  `plan`+license expiry), `normalizePlan`, `canAddBooth`, `canAddMenuItem`,
  `canHaveOptionGroups`.
- `platform-settings.ts` — `PlatformSettingsConfig` type and
  `DEFAULT_PLATFORM_SETTINGS` (banner off): the fail-safe fallback when the
  `platform_settings` row can't be read, so a read failure never shows a
  stale/wrong banner to every visitor.
  `platformSettings(read)` remembers the last successful read for 30 seconds
  per server instance, so the root layout does not query on every page
  request; a failed read is not remembered. `forgetPlatformSettings()` drops
  it, called when an admin saves the banner.
- `platform-settings.test.ts` — reuse inside the window, a fresh read after
  it, the one-request fallback on a failed read, and forgetting.
- `printkit/` — server-only HTTP client for printkit's job-creation,
  location-registration and printer-status APIs; see its own README. Unlike
  `paykit/`, an unset `NEXT_PUBLIC_PRINTKIT_URL` has no fallback host — it
  fails closed rather than guessing a deployment.
- `pricing.ts` — `PricingConfig` type and `DEFAULT_PRICING` (zeroed fallback
  when the `pricing` row is unreadable, e.g. pre-migration).
- `qkit-printkit-auth.ts` — `printkitCallbackBearerOk`: constant-time bearer
  check against `PRINTKIT_CALLBACK_SECRET` for `POST
/api/printkit/print-status` — a plain shared secret, no `kit_slug:` prefix
  (mirrors `merqo-auth.ts`'s `bearerOk`, not `paykit/client.ts`'s outbound
  `qkit:<secret>` convention), since printkit has exactly one caller
  registered for this endpoint.
- `qkit-printkit-auth.test.ts` — tests the unset-secret, missing-header,
  mismatched-secret, and matching-secret cases.
- `qkit-paykit-auth.ts` — `paykitCallbackBearerOk`: constant-time bearer
  check against `PAYKIT_CALLBACK_SECRET` for `POST
/api/paykit/payment-status`. A plain shared secret with no `kit_slug:`
  prefix. Separate from `qkit-printkit-auth.ts` on purpose: each inbound
  route has its own secret.
- `qkit-paykit-auth.test.ts` — tests the unset, empty, missing-header,
  wrong-scheme, mismatched, different-length and matching cases, and that the
  printkit callback secret is not accepted.
- `rate-limit.ts` — `clientIp(headers)` (best-effort, spoofable fairness key —
  not an authz signal) and `rateLimit(supabase, key, limit, windowSeconds)`,
  which calls the `check_rate_limit` RPC and fails OPEN (with a logged error)
  on limiter failure so a degraded limiter never blocks real customers.
- `rate-limit.test.ts` — tests the fail-open behavior and IP extraction.
- `realtime-orders.ts` — `parseRealtimeOrderEvent`/`applyRealtimeOrderEvent`:
  validates untrusted Supabase Realtime payloads via `orderRowSchema`, strips
  `access_token` before it reaches client state (Postgres replication
  broadcasts full rows regardless of REST column selection), and folds
  DELETE/INSERT/UPDATE events into the board's order list. INSERT and UPDATE upsert by id, recovering missed inserts and avoiding replay duplicates.
- `realtime-orders.test.ts` — tests payload validation (rejecting malformed
  events) and the fold logic for each event type.
- `recent-orders.ts` — `getRecentOrders`/`getRecentOrdersForBooth`/
  `addRecentOrder`: customer order history in `localStorage`
  (`qkit:recent-orders`, capped at 10), since unauthenticated customers have no
  server-side link between a device and its orders. `noteDisplayNumber`
  records the number the status page showed for an order (the day's rank under
  daily numbering), so the list names it the way the customer last saw it.
- `recent-orders.test.ts` — tests read/write validation, dedup-by-order, and
  the MAX-10 cap.
- `reorder-handoff.ts` — `stashReorder`/`takeReorder`/`isValidLine`: one-shot
  `sessionStorage` handoff (`qkit:reorder:{boothId}`) from the status page or
  recent-orders list back into the booth menu; read-once (cleared immediately
  on read).
- `reorder-handoff.test.ts` — tests stash/take round-tripping, one-shot
  consumption, and line validation.
- `reorder.ts` — `reconcileReorder(lines, menuItems, remaining)`: rebuilds a
  past order's lines against the CURRENT menu (fresh name/price), drops lines
  whose item/options no longer exist or that are out of stock, merges
  duplicates by `cartKey`, and clamps quantities to live remaining stock.
- `reorder.test.ts` — tests reconciliation against removed items, changed
  options, unavailable items, and stock-capped quantities.
- `reviews.ts` — `summarizeReviews`/`groupReviewsByBooth`: aggregates
  customer order-feedback rows into a per-vendor rating distribution, average,
  and recent-comments list, split per booth.
- `reviews.test.ts` — tests distribution/average math and per-booth grouping.
- `sales-summary.ts` — `SalesSummaryV1` (the FROZEN, versioned, snake_case
  external contract returned by `/api/v1/sales/summary`), `toSalesSummaryV1`
  (maps the internal `StatsSummary`), `salesSummaryToCsv`.
- `sales-summary.test.ts` — tests the v1 mapping and CSV serialization
  (including cell-quoting of values containing commas/quotes/newlines).
- `schemas.ts` — the Zod schema library for every form/action/JSONB boundary:
  `loginSchema`, `vendorSchema`, `menuItemFormSchema`/`menuItemSchema`,
  `optionGroupSchema`/`sanitizeOptionGroups`, `boothHoursSchema`/
  `parseBoothHours`, `paymentMarkerSchema` (the `{kind}` marker `booths.payment`
  stores: `pointer` or `paynow`. qkit keeps no rule about payee names, UENs,
  mobile numbers, links or QR images; paykit validates those, in the one form
  that edits them. `boothFormSchema` carries the form's switch as
  `takes_payment`), `placeOrderSchema`, `orderRowSchema`/
  `parseRealtimeOrderEvent`'s dependency, `parseOrderRef` (validates the
  boothId/orderNumber/token triple every customer order action receives),
  `parsePreClaimRef` (same shape minus `orderNumber`, for the pre-claim flow
  where a payment-required order has no number yet — `loadPreClaimContext`/
  `claimPayment` in `order/[boothId]/[orderNumber]/payment-actions.ts`),
  `feedbackSchema`, `supportMessageSchema`, `profileNameSchema`/
  `displayNameSchema`/`passwordChangeSchema`, `boardSettingsSchema` (now also
  `daily_order_number_reset: boolean` and `default_prep_minutes:
1-60|null`, migration 0062; `show_wait_estimate: boolean`, migration 0068;
  `customer_telegram_notify_enabled: z.boolean().default(true)`, 2026-08-16 —
  a vendor-side opt-out for `advanceOrder`'s customer Telegram "order ready"
  ping, `.default(true)` so every pre-existing `board_settings` row, which
  predates this key, keeps notifying exactly as before — no migration, this
  is a JSONB column key not a SQL column),
  `pricingFormSchema`/`grantPassSchema`,
  `parseMenuItems`/`parseOrderItems`, `menuCategorySchema`/
  `menuCategoriesSchema`/`parseMenuCategories` (booth's ordered
  `{id, label}` menu sections, edited through the menu manager). `boothFormSchema` also carries `walkup_default: z.boolean()
.default(false)` (migration 0080, event-mode setup — makes the live board
  auto-open walk-up order entry for that booth) alongside
  `requires_arrival_confirm`. `boothFormSchema` no longer carries
  `menu_items` (2026-09-01, the menu-manager split) — that column is now
  owned exclusively by `menuItemsInputSchema` (`z.array(menuItemFormSchema)`),
  the input schema for `dashboard/booths/actions.ts`'s new `saveMenuItems`,
  so `saveBooth` never reads or writes it and the two actions can't clobber
  each other with stale client state.
- `schemas.test.ts` — the largest test file in `lib/`: validates every schema
  above, including the payment-config cross-field rules (xor of UEN/mobile,
  pointer requiring a link or QR) and the tolerant vs. strict read/write
  boundary distinction.
- `stats.ts` — `computeStats(orders, topN)`: the core stats/margin engine —
  revenue, AOV, cancellation/refund/fulfilment rates, per-item revenue/cost/
  profit aggregation (`topItems`), hourly and day×hour (SGT) buckets,
  `optionBreakdown`, `grossMargin` (only computed when at least one item
  carries a cost); also `windowSeries`/`waitSeries` (bucketed trend/wait-time
  series), `avgWaitSeconds`, `peakThroughput`, `pctChange`,
  `estimateWaitSeconds` (recent-average × orders-ahead customer wait
  estimate, null below `minSample`; takes an optional
  `fallbackAvgSecondsPerOrder` — board_settings.default_prep_minutes × 60 —
  used only below that sample size, so a vendor's manual estimate never
  overrides real, trusted data), `currentPrepEstimate` (same threshold gate
  as `estimateWaitSeconds`, but returns the recent average in minutes plus
  the raw sample count/`minSample` instead of multiplying by orders-ahead —
  a vendor-facing "here's what's live right now" label for the Settings
  page, not part of any customer-facing wait calculation).
- `stats.test.ts` — tests bucketing, margin computation, refund detection,
  fulfilment-rate math, the trend/wait series against synthetic orders,
  `estimateWaitSeconds`'s fallback (used below the sample size, ignored once
  real data meets it, null when neither is available), and
  `currentPrepEstimate`'s below/at/custom-sample-size cases and its
  sample-met-but-no-usable-wait-data null case.
- `stock.ts` — `parseRemaining`/`remainingFor`: parses the
  `booth_remaining_stock` JSONB RPC result into a typed per-item remaining-
  count map (Postgres is authoritative; this just reports it to the cart UI).
- `stock.test.ts` — tests parsing of malformed/partial remaining-stock data.
- `stuck-orders.ts` — `statusSinceByOrder(orders, events)`: maps each order to
  when it entered its CURRENT status — the latest matching
  `order_status_events` row's `created_at` (migration 0078), or the order's
  own `created_at` when there's no event yet (an order that's never
  advanced past its initial placement, or a stale/mismatched latest event —
  `recordOrderStatusEvent`, `src/lib/audit.ts`, is best-effort and can
  silently fail). `findStuckOrders(orders, nowMs)`: non-terminal orders
  (`@/lib/orders`'s `isTerminal`) sitting past `STUCK_THRESHOLD_MS` (30 min)
  in their current status, longest-stuck first — the `/admin` overview's
  "Stuck orders" stat + list (`admin/stuck-orders-section.tsx`).
- `stuck-orders.test.ts` — tests the events-vs-created_at fallback
  (no events, a matching latest event, a mismatched/stale latest event, and
  events belonging to other orders) and threshold/terminal-status flagging
  across all four non-terminal statuses plus sort order.
- `supabase/` — the three Supabase client factories (browser/server/service-
  role) plus entitlement/user/vendor read helpers; see its own README.
- `types.ts` — the hand-maintained mirror of the `qkit` Postgres schema: core
  domain types (`OrderStatus`, `OrderSource` — `"qr"` | `"walkup"`, migration
  0060 — `Plan`, `PaymentKind`, `MenuItem`, `CartItem`,
  `OrderItem`, `BoardSettings`/`DEFAULT_BOARD_SETTINGS` — now also
  `daily_order_number_reset`/`default_prep_minutes`, migration 0062), and the
  full `Database["qkit"]` `Tables`/`Functions`/`Enums` shape (vendors, admins,
  admin_audit, events, licenses, payments, pricing, feedback,
  purchase_requests, booths — now also `walkup_default:
boolean`, migration 0080 — orders, booth_item_sold —
  `vendor_telegram`/`telegram_link_tokens` from migration 0076 were dropped
  again in migration 0077, Phase A2's retirement of qkit's own Telegram bot;
  RPCs
  `next_order_number`, `booth_remaining_stock`, `booth_servable`,
  `check_rate_limit`, `place_order`, `place_walkup_order` (now with `p_paid`,
  migration 0061), `get_booth_for_order`, `regenerate_short_code`,
  `submit_feedback`, `set_license_label`, `gen_short_code`) plus derived
  row-type aliases (`Vendor`, `Booth`, `Order`, `BoardOrder` = `Order` minus
  `access_token`, `License`, `Pricing`, `Payment`, `Feedback`, `Admin`,
  `AdminAudit`). Must be kept in sync with `supabase/migrations/` by hand (or
  via `supabase gen types typescript`).
- `tour-ids.ts` — `TOUR_IDS`/`TourId`/`tourIdSchema`: the allowlist for
  dashboard tourIds, kept in its own zero-React module rather than
  `@/components/tour/tour-steps` (which pulls in `react-dom/server` for the
  orders tour's example badge markup) since `tour-actions.ts`'s
  `markTourSeen` — a `"use server"` action, a real HTTP endpoint callable
  with any argument regardless of what the UI sends — needs to `safeParse`
  a caller's `tourId` before ever using it as an object key. An unvalidated
  version let a caller inject an arbitrary key into `vendors.tours_seen`
  (a real CodeQL finding: remote property injection).
- `tour-ids.test.ts` — asserts every `TOUR_IDS` entry parses and an
  arbitrary string (including `"__proto__"`) is rejected.
- `ticket.ts` — what the order ticket prints, kept pure so it is unit-tested
  apart from the card: `buildOptionCodes(menuItems)` (a booth's short codes
  keyed by item, group and choice label, since an order stores labels),
  `ticketOptions(item, codes)` (code where set, full choice otherwise, group
  prefixed when two would read the same), `suggestOptionCode(label)`
  (initials, offered as a placeholder and never applied), and
  `ticketAttention(...)` (the single most urgent flag for a ticket, or
  null). `OPTION_CODE_MAX` bounds a code's length.
- `tz.ts` — Singapore-only wall-clock helpers built on cached
  `Intl.DateTimeFormat` instances: `sgtHour`/`sgtMinutes`/`sgtWeekday`,
  `WEEKDAY_ORDER`/`WEEKDAY_LABELS`, display formatters `shortDay`/
  `sgtClock`/`sgtWeekdayTime`/`shortDateTime`, and `sgtStartOfDayIso` (the UTC
  instant for SGT midnight of a given moment — the query boundary for
  "today" in SGT, e.g. the daily order-number reset baseline and the
  completed-orders page's default "Today" filter) — always formats/computes
  in `Asia/Singapore`, never server UTC or the browser's tz, to stay
  hydration-safe.
- `tz.test.ts` — tests hour/weekday extraction, each display formatter
  against fixed ISO instants, and `sgtStartOfDayIso`'s day-boundary rollover.
- `utils.ts` — `cn` (clsx + tailwind-merge), shared form style constants
  (`FORM_LABEL_CLASS`, `FORM_ERROR_CLASS`), `MS_PER_HOUR`/`MS_PER_DAY`,
  `formatPrice`, `centsToDollarString`, `parseDollarsToCents` (keystroke-level
  validation for money inputs), `orderHasPricing`, `count` (pluralized noun),
  `formatOptions`, `menuItemActionLabel` (a menu item's add/customize button
  label — sold out / customize / add — shared by the customer order form and
  the vendor's walk-up order dialog).
- `utils.test.ts` — tests price formatting, dollar-string parsing edge cases,
  and pluralization.
- `admin/` — admin-only logic (access gate, fleet stats, vendor health, vendor names). See its own README.
- `booth/` — booth helpers (access and serve limits, short codes, colours, image paths). See its own README.
- `merqo/` — everything between qkit and merqo, the hub (route auth, metrics, plan requests, vendor status/activity/profile, support, notify calls). See its own README.

## Connectivity

`supabase/` provides the client factories (`createClient`/`createServerClient`/
`createServiceClient`) that every Server Action, Route Handler, and Server
Component in `src/app/` depends on for data access; `paykit/` provides the
HTTP client the customer checkout flow (order-status `page.tsx`,
`payment-actions.ts`) and the booth form (`dashboard/booths/actions.ts`,
which only reads which kind of payment the vendor has on file) both call
through. Pure helpers are unit-tested directly. Browser and server adapters use mocked
platform-boundary tests; Stryker covers its configured subset of `src/lib`, not
every module listed here.
`types.ts` is the DB type mirror imported almost everywhere for row shapes;
`schemas.ts` is the Zod boundary imported by every Server Action and form in
`src/app/` plus by `realtime-orders.ts` (which validates untrusted Realtime
payloads via `orderRowSchema`) and `reorder-handoff.ts`/`cart-storage.ts`
(which validate `sessionStorage` reads via `isValidLine`). `orders.ts`'s
`BOARD_ORDER_COLUMNS` is shared between the dashboard's server query and
`src/hooks/use-realtime-orders.ts`'s resync query so both stay in sync.
`stats.ts` feeds `sales-summary.ts` (the frozen `/api/v1/sales/summary`
contract) and the admin/vendor stats dashboards. `stuck-orders.ts` feeds the
`/admin` overview's "Stuck orders" stat + `StuckOrdersSection` list. `plan.ts`'s `Entitlement`
feeds `booth-access.ts`'s serveability calculation, mirroring the
`booth_servable` SQL function in `supabase/migrations/`.

## Payment proof schema

`schemas.ts` exports `paymentProofSchema`, `PAYMENT_PROOF_MAX_BYTES` (1 MB) and `PAYMENT_PROOF_EXTENSIONS` (MIME type to file extension, JPEG/PNG/WebP). `claimPayment` and `pay-form.tsx` both validate against it. `claimPayment` then forwards the file to paykit, which checks the same limits again (by the file's bytes) and stores it in its own bucket. qkit's `payment-proofs` bucket (migration `0093`) holds only screenshots from orders claimed before that moved. Keep qkit's schema and paykit's limits in step.

## Shared package note

`safe-redirect.ts` and `image-resize.ts` moved to `@merqo/ui` (v0.31.0) — both were duplicated across all five repos. Import `safeRedirectPath` and `resizeToWebp` from `@merqo/ui` instead. `image-upload-adapter.ts` stays local: the Storage bucket and object path are qkit's own.

## Replaced-avatar cleanup

`image-upload-adapter.ts` also exports `removeReplacedAvatar(url)`, a best-effort delete of an avatar image that is no longer referenced. `ImageUploader` writes every upload under a fresh random name, so without it each avatar change left the previous image in storage forever. It checks every public avatar bucket (`booth-images`, `vendor-images`, `vendor-avatars`), because all five Merqo apps share one signed-in user and so one `avatar_url`, which may have been set from any of them. It uses `@merqo/ui`'s `storagePathFromPublicUrl`, so an OAuth provider picture (a Google profile photo) is never treated as ours to delete, and it never throws. Each bucket's owner-folder DELETE policy still bounds what a vendor can remove.

## Deferred-upload cleanup

The booth banner and menu photo uploaders run in `@merqo/ui`'s
`deferUpload` mode, so an image reaches storage only when its form saves.
Two helpers delete what a failed save uploaded:
`removeUnsavedImages(urls)` in `image-upload-adapter.ts` is the browser-side,
best-effort delete for failures before anything is written, and
`failedSaveUploadPaths(urls, vendorId)` in `booth-images.ts` is the
pure filter `saveBooth` uses server-side. The filter only ever returns
booth-images objects in the vendor's own folder, since the list comes from
the client. A payment QR image is uploaded in paykit, not here.

## Parent

[src](../README.md)

## Review corrections (2026-10-07)

Menu CSV records preserve quoted LF, CRLF, and CR newlines on export/import.
Option statistics key group and choice as a tuple so different pairs cannot collide.
Restored carts recompute current option surcharges, including options on unpriced items.
