# tests

## Purpose

pgTAP database tests that guard the core authorization invariant of the whole
app: a vendor can never read or mutate another vendor's data, and the
customer-facing RPCs (`place_order`, `submit_feedback`, `get_booth_for_order`)
behave correctly under RLS and their own internal validation. This is
Postgres-policy testing, not user-flow testing — it runs in-database with
transaction isolation (fast, deterministic, no app/browser boot), which is
Supabase's official RLS-testing approach and is why it's a separate suite
from the Vitest/Playwright tests elsewhere in the repo.

## Contents

- `review-hardening.test.sql` — rolled-back regression fixtures for migration
  `0095`: plan and printer-id INSERT restrictions, service-only order numbering,
  daily-cap editing, nested menu-cost privacy, paid-order stock reservation,
  service-only rate limiting, feedback flood limits, option cardinality,
  validated analytics writes, optional shared metrics with preserved failures,
  and the service-role maintenance-banner grant. Uses `no_plan()` so each
  independently named assertion remains visible without a manual test count.
- `board-settings-patch.test.sql` — partial preference merges, caller-only RLS,
  strict patch types, allowed keys and timing limits for `0096`.
- `booth-creation-cap.test.sql` and `booth-cap-isolation.test.sql` — free booth
  cap, multirow/reassignment paths, paid entitlement and isolation-mode rules
  for `0097`; `isolation/` holds separate concurrent-session schedules.
- `scoped-admin-membership.test.sql` — 20 caller-scope, effective privilege,
  missing-claim, service-role and RLS compatibility assertions for `0098`.
- `audit-truncate-privileges.test.sql` — 18 effective privilege and denied
  service-role truncation assertions for the append-only trails (`0099`).
- `print-callback-ordering.test.sql` — monotonic print-state callback behavior.
- `booth-start-new-service.test.sql` — `0106`: anon cannot reset, vendors cannot write `cap_reset_at` directly, another vendor's reset is refused, the owner's reset zeroes `booth_cups_today`/`booth_cups_left` and lets the trigger take a full limit again, cancelled orders stay out, and a reset older than midnight falls back to midnight.
- `order-push-subscriptions.test.sql` — `0105`: no anon/authenticated privilege on push subscriptions, RLS on, and the trigger that drops a completed or cancelled order's rows.

These new regression fixtures are prepared but have not been executed in this
review: Docker Desktop's Linux database engine is unavailable.

- `rls.test.sql` — a single pgTAP file (`plan(132)`, run inside one rolled-back
  transaction with inline fixed-UUID fixtures — no shared state, no cleanup).
  What it actually asserts, by section:
  - RLS is enabled on `vendors`, `booths`, `orders`, `feedback`,
    `purchase_requests`, `licenses`. `legal_check_state` (migration `0084`,
    the legal-acceptance TTL cache) has RLS on, zero policies, and neither
    `anon` nor `authenticated` can SELECT it directly — a service-role-only
    table, same shape as `rate_limits`/`booth_item_sold`. (`support_messages`
    was dropped in
    migration `0073` — fully superseded by the shared
    `merqo.support_messages` table; `vendor_telegram`/`telegram_link_tokens`
    were added in migration `0076` and dropped again in `0077`, Phase A2's
    retirement of qkit's own Telegram bot — see `../migrations/README.md`.)
  - `qkit.order_item_quantities` pools and clamps quantities per menu item
    (negative lines clamp to 0; net-zero items are dropped) — the shared
    helper behind the stock-race fix (migration `0034`).
  - `qkit.vendor_entitled`/`can_create_booth` honor `valid_from` (a
    future-dated pass does not count yet) — migration `0038`'s fix.
  - `qkit.booth_open` correctly gates null/daily/weekly windows, including the
    overnight-carry fix from migration `0046` (a Fri 22:00-02:00 shift stays
    open into Saturday).
  - **As vendor A** (`authenticated` role, JWT `sub` set): reads its own
    booth/order but not vendor B's; cannot UPDATE B's order; can confirm
    payment on its own order but not B's; the column-freeze trigger blocks
    changing `total_cents`/`items`/`booth_id`/`access_token` on an existing
    order (`ORDER_IMMUTABLE_COLUMN`) while status/`ready_at` remain writable;
    the `orders_vendor_update` policy carries a `WITH CHECK`.
  - **Authenticated-role lockdown** (migration `0033`): a logged-in
    non-owner cannot read another vendor's servable booth, cannot INSERT
    into `orders` or `feedback` directly, and cannot EXECUTE
    `next_order_number` — closing paths that were closed for `anon` but not
    yet for any authenticated attacker.
  - Plan self-escalation is blocked (`UPDATE vendors SET plan='pro'` fails)
    while a legitimate self-edit (`tours_seen`) still works; booth
    re-pointing to another vendor is blocked by `WITH CHECK`;
    feedback/upgrade-request RLS scopes each vendor to its own rows and
    blocks filing as another vendor; `set_license_label` only affects the
    caller's own license.
  - **As anon** (no `auth.uid()`): cannot SELECT `booths` directly (the only
    public read is `get_booth_for_order`), cannot confirm payment on
    any order, and cannot INSERT analytics `events` directly. The validated
    server action now owns that write boundary, with application tests
    preserving anonymous event logging through it.
  - The full `place_order` order path: direct INSERT into `orders` is closed;
    `get_booth_for_order` strips `cost_cents` and never exposes `short_code`;
    a valid cart succeeds and inserts exactly one row; an idempotent replay
    with the same key returns the same `order_number` without a second
    insert; an unknown short code raises `ORDER_EXPIRED`; an over-cap single
    line and two separate lines of the same capped item that sum over the
    cap both raise `ORDER_SOLD_OUT`; a negative-quantity line can't mask an
    oversell; item name/cost are always re-derived from the stored menu
    (never trusting the client); an all-zero-quantity cart is rejected
    (`ORDER_INVALID`); an unknown customization option is rejected; a
    non-servable booth raises `ORDER_UNSERVABLE`; an item with no price set
    stores no `price_cents` key at all (not `0`) and totals the order at
    `0` (migration `0055`); a priced customization choice sums its delta into
    the authoritative total, and a `price_delta_cents` forged into a
    submitted option is ignored — only the stored menu's own delta is ever
    trusted (migration `0056`).
  - `submit_feedback`: a customer review bound to a real order's
    `(booth_id, order_number, access_token)` succeeds; a mismatched token is
    rejected (`FEEDBACK_UNAUTHORIZED`) — the migration `0048` review-bombing
    fix.
  - Cross-kit customer identity (migration `0075`): a real (not just stubbed-
    safe) `merqo` schema/`merqo.customers` table/`merqo.upsert_customer`
    function are created inside this same rolled-back transaction — matching
    merqo migration `0018`'s shape exactly — so the suite can prove both
    halves of the "genuinely optional" claim directly, not just that the
    guarded call doesn't crash: a `place_order`/`place_walkup_order` call
    with `p_customer_phone` set upserts exactly one row into
    `merqo.customers` (name included); a call with it omitted leaves that
    table completely untouched.
  - A $0 order never expects payment even at a paynow-configured booth
    (migration `0085`). A QR order lands `'pending'` by default (no printer
    connected) and auto-starts into `'preparing'` once `print_enabled` is on
    (migration `0086`).
  - Payment-first order numbering (migration `0087`): a payment-required
    order gets no `order_number` and lands `'pending'` even at a booth that
    would otherwise auto-start (printer connected, no arrival-confirm gate);
    `qkit.assign_order_number` is idempotent, returning the same number on a
    retried call for the same order; the loosened freeze trigger still
    blocks changing an already-assigned `order_number` to a different value
    or erasing it back to `NULL` (`ORDER_IMMUTABLE_COLUMN`) — only the
    one-time `NULL` → assigned transition is permitted; `anon` cannot read
    the `payment-proofs` storage bucket (a real row is seeded first, as the
    privileged role, so the check proves RLS actually filters it out).
    It also pins the bucket's own limits from migration `0093` (1 MB
    `file_size_limit`, JPEG/PNG/WebP `allowed_mime_types`), so a later
    migration cannot quietly loosen them.

## Connectivity

Run via `supabase test db` (the Supabase CLI's pgTAP runner) against a
database with `supabase/migrations/` already applied. Referenced directly
from the root `AGENTS.md` ("RLS isolation: `supabase/tests/rls.test.sql` via
`supabase test db`") as the authoritative check on the RLS policies defined in
`../migrations/`. Independent of the Next.js app and the Vitest/Playwright
suites — it tests the database layer in isolation.

It also covers the non-RLS database rules that app code cannot be trusted to
enforce, currently the `orders_daily_cup_cap` trigger from `0094`: an order
within the cap, one that would cross it, one that exactly fills it, cups
counted rather than orders, a cancelled order releasing its cups, and a booth
with no cap staying unlimited.

## Parent

[supabase](../README.md)
