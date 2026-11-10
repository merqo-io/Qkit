# db-types

## Purpose

The hand-written `Database["qkit"]` shape, split by table group so no single file grows past reading size. `src/lib/types.ts` composes these pieces back into `Database`; call sites keep importing from `@/lib/types`.

## Contents

- `account-tables.ts` — `AccountTables`: Row/Insert/Update shapes for `vendors`, `admins`, `admin_audit`, `events`, `vendor_entitlements`, `payments`, `platform_settings`, `legal_check_state` and `feedback`.
- `order-tables.ts` — `OrderTables`: Row/Insert/Update shapes for `booths`, `orders`, `booth_item_sold`, `order_status_events`, `order_push_subscriptions`, `booth_service_starts`, `ops_events`, `cart_holds` and `rate_limits`.
- `proof-storage-tables.ts` — `ProofStorageTables`: the `proof_storage_deletions` queue table (migration 0119).
- `functions.ts` — `DbFunctions`: Args/Returns shapes for the qkit schema's Postgres functions (`is_admin`, `place_order`, `place_walkup_order`, `start_new_service`, the stock and entitlement helpers and the purge and sweep jobs).

## Conventions

- Edit these files in the same change as the migration under `supabase/migrations/`; the two must not drift.
- Import domain unions (`OrderStatus`, `PaymentKind`, `Tier`, `Json`) from `@/lib/types` and `@/lib/plan` rather than redeclaring them.
- No barrel `index.ts`; import each file by its path.

## Parent

[lib](../README.md)
