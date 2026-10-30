# migrations

## Purpose

Append-only SQL history defining qkit tables, RLS policies, constrained RPCs,
triggers, indexes and Data API privileges. Apply migrations in filename order.
Correct an applied migration with a new migration rather than rewriting it.

## Contents

| Range         | Purpose                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `0000`–`0009` | Schema, vendor/booth/order foundations, admin identity, storage and numbering                                                   |
| `0010`–`0021` | Entitlements, pricing, stock, rate limiting, feedback and upgrade requests                                                      |
| `0022`–`0043` | Order timestamps, QR capabilities, server repricing, explicit grants, immutable columns and RLS performance                     |
| `0044`–`0068` | Per-order proof, schedule enforcement, feedback proof, preferences, social links, staff ordering and menu categories            |
| `0069`–`0084` | Shared-profile/feedback/support convergence, bot retirement, audit history, printing, booking references and legal-status cache |
| `0085`–`0094` | Free-payment handling, payment-first numbering, restricted server-assigned columns, proof-upload limits and daily cup caps      |
| `0095` onward | Forward security, concurrency and settings corrections described below                                                          |

Current ordering uses `place_order` for QR customers and `place_walkup_order`
for authenticated owners. Both reprice against stored menu choices; submitted
prices are informational. QR readers use the sanitized `get_booth_for_order`
projection. Anonymous/authenticated callers cannot directly insert orders.
Paid QR orders begin `pending` without a number; privileged payment handling
assigns a number. Print opt-in does not prove physical printer connectivity.

The latest forward corrections are:

- `0095_review_authorization_hardening.sql`: service-only order numbering and
  generic rate limiting, restricted vendor/booth INSERT columns, nested cost
  privacy, shared option validation, paid-order stock locking, bounded
  order-proof feedback and validated server-owned analytics. Missing optional
  shared metrics are skipped; installed integration errors still propagate.
- `0100_atomic_board_settings_patch.sql`: caller-scoped partial settings merge
  with strict keys, types and merged timing validation under a row lock.
- `0101_atomic_booth_creation_cap.sql`: owner-only statement triggers enforce
  the free booth cap across inserts and vendor reassignment. Sorted vendor
  locks and a fresh recount serialize competing writes; cap-enforced free
  writes require READ COMMITTED. Paid entitlements retain their existing rules.
- `0102_scoped_admin_membership.sql`: authenticated admin-membership checks are
  limited to the caller's subject, with privileged service lookups retained;
  anonymous and default PUBLIC execution are revoked.
- `0103_audit_truncate_privileges.sql`: service-role `TRUNCATE` is revoked on
  the existing audit trails while reads/appends and owner maintenance remain.

Column privileges and RLS work together. Revoking one column does not subtract
it from a table-level grant (`0042`); grant only editable columns. An omitted
UPDATE `WITH CHECK` uses the `USING` expression for new rows, so the explicit
checks in older migrations clarify policy intent rather than fixing an
implicit ownership-reassignment bypass.

## Connectivity

Apply through the Supabase CLI and the project's migration safety workflow.
Application deployment alone does not apply database permission corrections.
Keep [the TypeScript schema mirror](../../src/lib/types.ts) aligned with schema
changes; regenerate from a disposable database when available.

Shared deployments must apply the corresponding Merqo migrations before
profile/feedback/support backfills and their local-column/table retirement.
Existence guards allow isolated qkit development, but do not prove that a
shared production backfill ran or that deployment ordering was correct.
Qkit's retired bot requires vendors to authorize the shared Merqo bot; this
is a bot-authorization change, not evidence that private Telegram chat IDs
are numerically different between bots.

[Database regressions](../tests/README.md) exercise authorization, RPCs and
concurrency separately from mocked application tests. The current forward
fixtures have not been executed in this review because Docker Desktop's
Linux database engine is unavailable. [Seeds](../seed/README.md) are manual
fixtures with separate Paykit checkout prerequisites.

## Parent

[supabase](../README.md)

## Upstream ordering additions

- 0096_order_limit_and_cart_holds.sql adds per-order limits and anonymous basket holds. SQL placement enforces stock independently of holds; the current customer UI also blocks and trims baskets using held availability, so sustained anonymous holds remain an availability-abuse concern.
- 0097_scheduled_order_sweep.sql schedules stale-payment cancellation and ready-order completion when pg_cron is available; verify actual scheduling separately.
- 0098_order_sweep_indexes.sql indexes the in-flight orders used by that sweep.

The audit additions follow these deployed versions as 0100 through 0103. Local database and isolation-runner validation remain outstanding.

- 0104_booth_pickup_scan_enabled.sql moves self-checkout pickup from the vendor-wide `board_settings.pickup_scan_enabled` key to a per-booth `booths.pickup_scan_enabled` column, backfilled from each vendor's current value and granted to vendors. Apply it before deploying the app that reads it.
- 0106_booth_start_new_service.sql adds `booths.cap_reset_at` and the vendor-only `qkit.start_new_service(uuid)` RPC (SECURITY DEFINER, owner check on `auth.uid()`, stamps `now()`; no column grant to vendors). `qkit.booth_cups_today` and the `orders_daily_cup_cap` trigger count from the later of midnight SGT and `cap_reset_at`. Apply it before deploying the app that calls the RPC.
- 0105_order_push_subscriptions.sql adds `qkit.order_push_subscriptions` (service-role only: RLS on, no policies, no anon/authenticated grant) for the order-ready web push, plus a trigger that drops an order's rows when it is completed or cancelled. Apply it before deploying the app that writes it.
- 0109_fk_indexes.sql indexes every foreign key column the Supabase advisor flagged as unindexed (`admin_audit.admin_id`, `feedback.vendor_id`, `order_status_events.actor`, `payments.license_id`, `purchase_requests.vendor_id`).
