-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
--
-- Guards the core invariant: a vendor can never read or mutate another vendor's
-- booths, orders, customer feedback, upgrade requests, or licenses. Runs in ONE
-- rolled-back transaction with inline fixtures (fixed UUIDs) — no shared state,
-- no cleanup.
--
-- Why pgTAP and not Playwright: this is a database-policy assertion, not a user
-- flow. pgTAP runs in-DB with transaction isolation — fast, deterministic, no
-- app/browser boot. (Supabase's official RLS-testing path.)

begin;
select plan(156);

-- ── Fixtures (created as the superuser test role → RLS bypassed here) ─────────
-- Two vendors, each with one INACTIVE booth (inactive so the public-read policy
-- can't expose them), one order, one customer review, one upgrade request, and
-- one license.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-b@test.local');

insert into qkit.vendors (id)
values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- Active licenses precede multi-booth fixtures because service writes also obey the creation cap.
insert into qkit.licenses (id, vendor_id, valid_from, expires_at)
values
  ('00000000-0000-0000-0000-0000000c0001',
   '00000000-0000-0000-0000-00000000000a', now() - interval '1 day',
   now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000c0002',
   '00000000-0000-0000-0000-00000000000b', now() - interval '1 day',
   now() + interval '1 day');

insert into qkit.booths (id, vendor_id, name, is_active)
values
  ('00000000-0000-0000-0000-0000000b0001',
   '00000000-0000-0000-0000-00000000000a', 'A Booth', false),
  ('00000000-0000-0000-0000-0000000b0002',
   '00000000-0000-0000-0000-00000000000b', 'B Booth', false);

-- One ACTIVE booth for A carrying a payment method. Before the order-path hardening this was
-- directly readable by anon; as of 0029 anon's direct booths SELECT is
-- revoked, so this fixture now exists only as an active-but-otherwise-unread
-- booth (kept for column stability / minimal diff — not asserted on directly).
insert into qkit.booths (id, vendor_id, name, is_active, payment)
values
  ('00000000-0000-0000-0000-0000000b0003',
   '00000000-0000-0000-0000-00000000000a', 'A Active',
   true, '{"kind":"paynow","payee_name":"A","uen":"53312345A"}'::jsonb);

insert into qkit.orders
  (id, booth_id, order_number, customer_name, items, total_cents)
values
  ('00000000-0000-0000-0000-00000000d001',
   '00000000-0000-0000-0000-0000000b0001', 'A-001', 'Cust', '[]'::jsonb, 500),
  ('00000000-0000-0000-0000-00000000d002',
   '00000000-0000-0000-0000-0000000b0002', 'B-001', 'Cust', '[]'::jsonb, 500);

-- Customer reviews tied to each booth.
insert into qkit.feedback (id, source, booth_id, rating)
values
  ('00000000-0000-0000-0000-0000000f0001', 'customer',
   '00000000-0000-0000-0000-0000000b0001', 5),
  ('00000000-0000-0000-0000-0000000f0002', 'customer',
   '00000000-0000-0000-0000-0000000b0002', 4);

-- Upgrade requests, one per vendor.
insert into qkit.purchase_requests (id, vendor_id, kind)
values
  ('00000000-0000-0000-0000-0000000e0001',
   '00000000-0000-0000-0000-00000000000a', 'event'),
  ('00000000-0000-0000-0000-0000000e0002',
   '00000000-0000-0000-0000-00000000000b', 'monthly');

-- Vendor C: its OWN single active booth with a known short_code and a
-- stock-capped menu item — used by the order-path RPC tests below
-- (get_booth_for_order / place_order). Being the vendor's only (hence oldest)
-- active booth makes booth_servable() trivially true under the free-plan rule,
-- so these tests don't depend on plan/license fixtures.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-c@test.local');

insert into qkit.vendors (id)
values ('00000000-0000-0000-0000-00000000000c');

-- Vendor C also holds a FUTURE-dated pass (starts tomorrow) — used to prove the
-- entitlement predicate honours valid_from (0038): it must NOT count yet.
insert into qkit.licenses (id, vendor_id, valid_from, expires_at)
values (
  '00000000-0000-0000-0000-0000000c0003',
  '00000000-0000-0000-0000-00000000000c',
  now() + interval '1 day', now() + interval '2 day');

insert into qkit.booths (id, vendor_id, name, is_active, short_code, menu_items)
values (
  '00000000-0000-0000-0000-0000000b0004',
  '00000000-0000-0000-0000-00000000000c',
  'C Order Booth', true, 'rlstestcode1',
  '[
     {"id":"cap1","name":"Capped Bun","description":"","price_cents":500,
      "cost_cents":200,"available":true,"stock":2},
     {"id":"free1","name":"Unlimited Tea","description":"","price_cents":300,
      "cost_cents":100,"available":true},
     {"id":"free2","name":"No-Cost Snack","description":"","price_cents":100,
      "available":true},
     {"id":"unpriced1","name":"Free Sample","description":"","available":true},
     {"id":"fancy1","name":"Fancy Coffee","description":"","price_cents":400,
      "available":true,
      "option_groups":[
        {"id":"milk","label":"Milk","choices":[
          {"id":"reg","label":"Regular"},
          {"id":"oat","label":"Oat Milk","price_delta_cents":150}
        ]}
      ]}
   ]'::jsonb
);

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'qkit.vendors'::regclass), 'RLS on vendors');
select ok((select relrowsecurity from pg_class where oid = 'qkit.booths'::regclass), 'RLS on booths');
select ok((select relrowsecurity from pg_class where oid = 'qkit.orders'::regclass), 'RLS on orders');
select ok((select relrowsecurity from pg_class where oid = 'qkit.feedback'::regclass), 'RLS on feedback');
select ok((select relrowsecurity from pg_class where oid = 'qkit.purchase_requests'::regclass), 'RLS on purchase_requests');
select ok((select relrowsecurity from pg_class where oid = 'qkit.licenses'::regclass), 'RLS on licenses');

-- ── Shared stock-quantity rule (0034 / T4 + R4) ──────────────────────────────
-- order_item_quantities is the single source the gate and the counter both use:
-- pool per menu item, clamp each line to >= 0, drop items that net to 0.
select is(
  (select qty from qkit.order_item_quantities(
     '[{"menuItemId":"x","quantity":2},
       {"menuItemId":"x","quantity":-5},
       {"menuItemId":"x","quantity":1}]'::jsonb)
   where menu_item_id = 'x'),
  3, 'order_item_quantities pools and clamps per line (2 + 0 + 1 = 3)');
select is_empty(
  $$ select 1 from qkit.order_item_quantities(
       '[{"menuItemId":"y","quantity":0},
         {"menuItemId":"y","quantity":-3}]'::jsonb) $$,
  'order_item_quantities drops an item whose lines net to 0');

-- ── Shared entitlement predicate honours valid_from (0038 / T25) ─────────────
-- A holds an active license (valid_from past, expires future) → entitled.
select ok(
  qkit.vendor_entitled('00000000-0000-0000-0000-00000000000a'),
  'vendor_entitled true for an active license');
-- C holds only a FUTURE-dated pass → not entitled yet (the valid_from fix; the
-- old expires-only predicate would have counted it).
select ok(
  NOT qkit.vendor_entitled('00000000-0000-0000-0000-00000000000c'),
  'vendor_entitled false for a future-dated license');
-- …and the create-cap agrees: C already has a booth and isn't entitled, so it
-- cannot create another (the old can_create_booth would have allowed it).
select ok(
  NOT qkit.can_create_booth('00000000-0000-0000-0000-00000000000c'),
  'can_create_booth false for a future-dated pass holder with a booth');

-- ── booth_open (0044): server-side opening-hours gate (SGT, deterministic) ────
-- p_now is explicit so these don't depend on the wall clock. 05:00Z = 13:00 SGT.
select ok(
  qkit.booth_open(NULL, now()),
  'booth_open: null hours is always open');
select ok(
  qkit.booth_open('{"mode":"daily","open":"00:00","close":"23:59"}'::jsonb,
                    '2026-01-01T05:00:00Z'::timestamptz),
  'booth_open: inside a daily window is open (13:00 SGT)');
select ok(
  NOT qkit.booth_open('{"mode":"daily","open":"09:00","close":"17:00"}'::jsonb,
                        '2026-01-01T00:00:00Z'::timestamptz),
  'booth_open: outside a daily window is closed (08:00 SGT)');
-- Weekly overnight window (0046): Fri 22:00-02:00, Sat null. 2026-06-12 = Friday.
-- 15:00Z = Fri 23:00 SGT (evening); 17:00Z = Sat 01:00 SGT (carry from Fri);
-- 19:00Z = Sat 03:00 SGT (past Fri's close).
select ok(
  qkit.booth_open('{"mode":"weekly","days":{"mon":null,"tue":null,"wed":null,"thu":null,"fri":{"open":"22:00","close":"02:00"},"sat":null,"sun":null}}'::jsonb,
                    '2026-06-12T15:00:00Z'::timestamptz),
  'booth_open: weekly overnight open in the evening (Fri 23:00)');
select ok(
  qkit.booth_open('{"mode":"weekly","days":{"mon":null,"tue":null,"wed":null,"thu":null,"fri":{"open":"22:00","close":"02:00"},"sat":null,"sun":null}}'::jsonb,
                    '2026-06-12T17:00:00Z'::timestamptz),
  'booth_open: weekly overnight carries past midnight into a null next day (Sat 01:00)');
select ok(
  NOT qkit.booth_open('{"mode":"weekly","days":{"mon":null,"tue":null,"wed":null,"thu":null,"fri":{"open":"22:00","close":"02:00"},"sat":null,"sun":null}}'::jsonb,
                        '2026-06-12T19:00:00Z'::timestamptz),
  'booth_open: weekly overnight closed after the carried close (Sat 03:00)');

-- ── Act as Vendor A (authenticated role + JWT claims so auth.uid() = A) ───────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000a',
    'role', 'authenticated'
  )::text,
  true);

-- Booths + orders.
select isnt_empty(
  $$ select 1 from qkit.booths where id = '00000000-0000-0000-0000-0000000b0001' $$,
  'A reads its own booth');
select is_empty(
  $$ select 1 from qkit.booths where id = '00000000-0000-0000-0000-0000000b0002' $$,
  'A cannot read B booth');
select isnt_empty(
  $$ select 1 from qkit.orders where id = '00000000-0000-0000-0000-00000000d001' $$,
  'A reads its own order');
select is_empty(
  $$ select 1 from qkit.orders where id = '00000000-0000-0000-0000-00000000d002' $$,
  'A cannot read B order');
-- A data-modifying CTE must attach to the TOP-LEVEL statement, so the WITH
-- leads the `select is(...)` (it can't sit inside a scalar subquery).
with upd as (
  update qkit.orders set status = 'ready'
  where id = '00000000-0000-0000-0000-00000000d002' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot update B order');

-- Payment confirmation rides the same orders update policy: A confirms its own
-- order's payment, but never B's.
with upd as (
  update qkit.orders set payment_status = 'confirmed', paid_at = now()
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is(
  (select count(*)::int from upd),
  1, 'A can confirm payment on its own order');
with upd as (
  update qkit.orders set payment_status = 'confirmed'
  where id = '00000000-0000-0000-0000-00000000d002' returning 1)
select is(
  (select count(*)::int from upd),
  0, 'A cannot confirm payment on B order');

-- ── Order integrity (0032) ───────────────────────────────────────────────────
-- Financial/identity columns are frozen after creation (BEFORE UPDATE trigger),
-- and the vendor UPDATE policy now carries a WITH CHECK. A owns order d001;
-- these updates pass the USING filter and reach the freeze trigger, which
-- throws. pgTAP wraps each throws_like in a savepoint, so the outer txn
-- survives and later tests still run.
select throws_like(
  $$ update qkit.orders set total_cents = 1
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot change total_cents on its own order');
select throws_like(
  $$ update qkit.orders
       set items = '[{"menuItemId":"x","name":"Forged","quantity":1}]'::jsonb
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot change items on its own order');
select throws_like(
  $$ update qkit.orders set booth_id = '00000000-0000-0000-0000-0000000b0003'
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot re-point booth_id (frozen; WITH CHECK also guards ownership)');
-- access_token is the status-page secret — frozen too (0045), so it can't be
-- rotated to hijack another order's status page.
select throws_like(
  $$ update qkit.orders set access_token = gen_random_uuid()
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'vendor cannot rotate access_token on its own order (frozen)');
-- The state machine stays writable: a status advance on the own order succeeds.
with upd as (
  update qkit.orders set status = 'ready', ready_at = now()
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is((select count(*)::int from upd), 1,
  'vendor can still advance status on its own order');
-- The UPDATE policy actually carries a WITH CHECK (ownership on the result row).
select isnt(
  (select with_check from pg_policies
   where tablename = 'orders' and policyname = 'orders_vendor_update'),
  null, 'orders_vendor_update has a WITH CHECK clause');

-- Manual queue priority bump (0057) rides the same orders_vendor_update
-- policy as every other state-machine column — no new policy needed, but
-- confirm the RLS boundary holds for it same as status: A can bump its own
-- order, but a bump attempt on B's order is silently filtered to 0 rows.
with upd as (
  update qkit.orders set priority_bumped_at = now()
  where id = '00000000-0000-0000-0000-00000000d001' returning 1)
select is((select count(*)::int from upd), 1,
  'vendor can bump its own order');
with upd as (
  update qkit.orders set priority_bumped_at = now()
  where id = '00000000-0000-0000-0000-00000000d002' returning 1)
select is((select count(*)::int from upd), 0, 'A cannot bump B order');

-- ── Authenticated-role lockdown (0033) ──────────────────────────────────────
-- Phase A closed these for anon only; sign-up is open, so `authenticated` is
-- attacker-reachable. A is a logged-in vendor that does NOT own Vendor C's
-- servable booth b0004. Every direct path must be denied for A too.
-- booths_public_read is dropped → A cannot read another vendor's servable booth
-- (this was the cost_cents + short_code cross-vendor leak).
select is_empty(
  $$ select 1 from qkit.booths where id = '00000000-0000-0000-0000-0000000b0004' $$,
  'authenticated non-owner cannot read another vendor''s servable booth');
-- orders_public_insert is dropped + INSERT revoked → no forged orders.
select throws_ok(
  $$ insert into qkit.orders
       (booth_id, order_number, customer_name, items, total_cents)
     values
       ('00000000-0000-0000-0000-0000000b0004', 'H-001', 'Mallory', '[]'::jsonb, 0) $$,
  null,
  'authenticated cannot INSERT into orders directly');
-- feedback_public_insert is dropped + INSERT revoked → no forged reviews.
select throws_ok(
  $$ insert into qkit.feedback (source, booth_id, rating)
     values ('customer', '00000000-0000-0000-0000-0000000b0004', 1) $$,
  null,
  'authenticated cannot INSERT into feedback directly');
-- next_order_number EXECUTE revoked from authenticated → cannot burn order_seq.
select throws_ok(
  $$ select qkit.next_order_number('00000000-0000-0000-0000-0000000b0004'::uuid) $$,
  null,
  'authenticated cannot EXECUTE next_order_number');

-- ── UPDATE-policy WITH CHECK + plan-escalation (0035 / T7) ──────────────────
-- Free→pro escalation: `plan` lives on the vendor's own row, so before the
-- column revoke a vendor could set it directly. UPDATE(plan) is now revoked from
-- authenticated (only the service-role admin action writes it).
select throws_ok(
  $$ update qkit.vendors set plan = 'pro'
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  null,
  'authenticated vendor cannot self-escalate plan to pro');
-- A legitimate self-edit (tours_seen) still works — the revoke is column-scoped.
select lives_ok(
  $$ update qkit.vendors set tours_seen = '{"orders":"2026-01-01T00:00:00Z"}'::jsonb
     where id = '00000000-0000-0000-0000-00000000000a' $$,
  'vendor can still update its own tours_seen');
-- WITH CHECK now blocks re-pointing an owned booth to another vendor (the USING
-- filter passes since A owns it; the result row would belong to B).
select throws_ok(
  $$ update qkit.booths set vendor_id = '00000000-0000-0000-0000-00000000000b'
     where id = '00000000-0000-0000-0000-0000000b0001' $$,
  null,
  'vendor cannot re-point its own booth to another vendor (WITH CHECK)');
select isnt(
  (select with_check from pg_policies
   where tablename = 'vendors' and policyname = 'vendors_self_update'),
  null, 'vendors_self_update has a WITH CHECK clause');
select isnt(
  (select with_check from pg_policies
   where tablename = 'booths' and policyname = 'booths_vendor_update'),
  null, 'booths_vendor_update has a WITH CHECK clause');
select isnt(
  (select with_check from pg_policies
   where tablename = 'purchase_requests' and policyname = 'purchase_requests_admin_update'),
  null, 'purchase_requests_admin_update has a WITH CHECK clause');

-- Customer feedback: A sees only its own booths' reviews.
select isnt_empty(
  $$ select 1 from qkit.feedback where booth_id = '00000000-0000-0000-0000-0000000b0001' $$,
  'A reads its own booth feedback');
select is_empty(
  $$ select 1 from qkit.feedback where booth_id = '00000000-0000-0000-0000-0000000b0002' $$,
  'A cannot read B booth feedback');

-- Upgrade requests: A sees only its own, and cannot file one as B.
select isnt_empty(
  $$ select 1 from qkit.purchase_requests where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own upgrade request');
select is_empty(
  $$ select 1 from qkit.purchase_requests where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B upgrade request');
select throws_ok(
  $$ insert into qkit.purchase_requests (vendor_id, kind)
     values ('00000000-0000-0000-0000-00000000000b', 'event') $$,
  null,
  'A cannot file an upgrade request as B');

-- set_license_label: only the owner's label changes.
select qkit.set_license_label('00000000-0000-0000-0000-0000000c0001', 'Event A');
select is(
  (select label from qkit.licenses where id = '00000000-0000-0000-0000-0000000c0001'),
  'Event A', 'A can label its own license');
-- A attempts to label B's license — the function's ownership filter no-ops it.
select qkit.set_license_label('00000000-0000-0000-0000-0000000c0002', 'Hacked');

reset role; -- back to the superuser test role to verify B's row is untouched
select is(
  (select label from qkit.licenses where id = '00000000-0000-0000-0000-0000000c0002'),
  null, 'B license label is unchanged by A');

-- ── Act as an anonymous customer (anon role, no auth.uid()) ──────────────────
set local role anon;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon')::text,
  true);

-- Direct SELECT on booths is closed (0029 — get_booth_for_order is the only
-- public read; it strips cost_cents/short_code and never exposes payment
-- internals). This also supersedes the pre-hardening "anon reads active booth
-- payment config" direct-select test, which the 0029 REVOKE now makes throw.
select throws_ok(
  $$ select 1 from qkit.booths limit 1 $$,
  null,
  'anon cannot SELECT booths directly');

-- But anon can never flip an order to a paid/confirmed state directly — only the
-- owning vendor can. anon has NO grant on orders (0041; customer flows go through
-- the service client / RPCs), so a direct update is denied outright.
select throws_ok(
  $$ update qkit.orders set payment_status = 'confirmed'
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  null,
  'anon cannot confirm payment on any order');

-- Anonymous visitors still log through the validated logEvent server action.
-- 0095 closes direct Data API writes that bypass its type/size/rate checks.
select throws_ok(
  $$ insert into qkit.events (type) values ('landing_cta') $$,
  '42501', null,
  'anon cannot bypass the validated analytics server action');

-- ── Order-path write path (anon) — migrations 0027–0031 ─────────────────────

-- Direct INSERT into orders is closed (0030); place_order is the only path.
select throws_ok(
  $$ insert into qkit.orders
       (booth_id, order_number, customer_name, items, total_cents)
     values
       ('00000000-0000-0000-0000-0000000b0004', 'X-999', 'Eve', '[]'::jsonb, 0) $$,
  null,
  'anon cannot INSERT into orders directly');

-- next_order_number is superseded by place_order's own numbering; EXECUTE
-- was revoked from anon in 0030.
select throws_ok(
  $$ select qkit.next_order_number('00000000-0000-0000-0000-0000000b0004'::uuid) $$,
  null,
  'anon cannot EXECUTE next_order_number');

-- place_walkup_order is vendor-only (its own auth.uid() check already blocks
-- an anon caller, but 0089 also revokes the EXECUTE grant PUBLIC left in
-- place, matching every other write RPC in this schema).
select throws_ok(
  $$ select qkit.place_walkup_order(
       '00000000-0000-0000-0000-0000000b0004'::uuid, 'Eve', '[]'::jsonb) $$,
  null,
  'anon cannot EXECUTE place_walkup_order');

-- get_booth_for_order: the only public read — public-safe projection only.
select ok(
  (select bool_and(not (mi ? 'cost_cents'))
   from jsonb_array_elements(
     qkit.get_booth_for_order('rlstestcode1') -> 'menu_items'
   ) as mi),
  'get_booth_for_order strips cost_cents from every menu item');
select ok(
  not (qkit.get_booth_for_order('rlstestcode1') ? 'short_code'),
  'get_booth_for_order never exposes short_code');

-- place_order: happy path succeeds and inserts exactly one row.
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
       '11111111-1111-1111-1111-111111111111'::uuid) $$,
  'place_order succeeds for a valid cart');

-- The side-effect verifications below read protected tables (orders/feedback)
-- DIRECTLY. Under `auto_expose_new_tables = false` (config.toml) anon has no
-- base SELECT on those tables — and these checks are NOT about anon's read
-- permission (the deny tests above already cover that). They verify what the
-- SECURITY DEFINER RPCs wrote, so run them as the privileged test role; the
-- RPCs behave identically regardless of caller (definer). anon-callability
-- stays asserted by the place_order lives_ok above and the anon-scoped
-- submit_feedback test below.
reset role;
select is(
  (select count(*)::int from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  1, 'place_order inserted exactly one row');
-- The order carries an unguessable access_token (0044) — what the status page +
-- polling reads now authorize on, closing the sequential-order-number leak.
select isnt(
  (select access_token::text from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  null, 'place_order minted a per-order access_token');

-- An item with no price set stores no price_cents key at all (0055) — not
-- coalesced to 0 — so a customer/vendor can tell "genuinely free" apart from
-- "explicitly priced at $0.00".
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"unpriced1","name":"Free Sample","quantity":1}]'::jsonb,
       '44444444-4444-4444-4444-444444444444'::uuid) $$,
  'place_order succeeds for an item with no price set');
select ok(
  not (
    (select items -> 0 from qkit.orders
     where booth_id = '00000000-0000-0000-0000-0000000b0004'
       and idempotency_key = '44444444-4444-4444-4444-444444444444')
    ? 'price_cents'
  ),
  'an unpriced item omits price_cents entirely, not 0');
select is(
  (select total_cents from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '44444444-4444-4444-4444-444444444444'),
  0, 'an order of only unpriced items totals 0');

-- A $0 order must never expect payment, even at a paynow-configured booth
-- (0085). place_order is SECURITY DEFINER, so calling it straight as the
-- superuser test role (like every neighboring test in this section) proves
-- the same thing an anon call would, without a role round-trip to clean up.
update qkit.booths set payment = '{"kind":"paynow"}'::jsonb
  where id = '00000000-0000-0000-0000-0000000b0004';
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"unpriced1","name":"Free Sample","quantity":1}]'::jsonb,
       '99999999-9999-9999-9999-999999999999'::uuid) $$,
  'place_order succeeds for a free item at a paynow-configured booth');
select is(
  (select payment_status::text from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '99999999-9999-9999-9999-999999999999'),
  'not_required',
  'a $0 order skips payment even when the booth has a payment method configured');
update qkit.booths set payment = null
  where id = '00000000-0000-0000-0000-0000000b0004';

-- A new order lands 'pending' (needs a vendor accept) when the booth has no
-- printer connected (0086) — the earlier happy-path order above already
-- exercised this default (print_enabled defaults false) without asserting
-- status; assert it explicitly here, then flip print_enabled on and confirm
-- the order waits for vendor Start even when a printer is connected.
select is(
  (select status::text from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  'pending',
  'a QR order lands pending by default (no printer connected)');
update qkit.booths set print_enabled = true
  where id = '00000000-0000-0000-0000-0000000b0004';
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'place_order succeeds at a printer-connected booth');
select is(
  (select status::text from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending',
  'a printing QR order waits for vendor Start');
update qkit.booths set print_enabled = false
  where id = '00000000-0000-0000-0000-0000000b0004';

-- A priced customization choice (0056 / menu-choice-price-delta): "Fancy
-- Coffee" is $4.00 base, "Oat Milk" adds $1.50 -> $5.50 total.
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"fancy1","name":"Fancy Coffee","quantity":1,
          "options":[{"group":"Milk","choice":"Oat Milk"}]}]'::jsonb,
       '55555555-5555-5555-5555-555555555555'::uuid) $$,
  'place_order succeeds for an item with a priced option');
select is(
  (select total_cents from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '55555555-5555-5555-5555-555555555555'),
  550, 'a priced option''s delta is summed into the authoritative total (400 + 150)');

-- A forged price_delta_cents stuffed into the submitted option is ignored —
-- "Regular" carries no real delta in the stored menu, so the total stays the
-- base price regardless of what the request claims.
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ada',
       '[{"menuItemId":"fancy1","name":"Fancy Coffee","quantity":1,
          "options":[{"group":"Milk","choice":"Regular","price_delta_cents":99999}]}]'::jsonb,
       '66666666-6666-6666-6666-666666666666'::uuid) $$,
  'place_order succeeds when the request forges a price_delta_cents on options');
select is(
  (select total_cents from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '66666666-6666-6666-6666-666666666666'),
  400, 'a forged price_delta_cents in the request is ignored — only the stored menu''s delta is trusted');

-- Replay with the SAME idempotency key must return the SAME order_number and
-- must not insert a second row.
select is(
  (select qkit.place_order(
     'rlstestcode1', 'Ada',
     '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
     '11111111-1111-1111-1111-111111111111'::uuid) ->> 'order_number'),
  (select order_number from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  'place_order replay returns the same order_number');
select is(
  (select count(*)::int from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  1, 'place_order replay does not insert a second row');

-- Unknown / rotated-away short_code.
select throws_like(
  $$ select qkit.place_order(
       'no-such-code', 'Eve', '[]'::jsonb, gen_random_uuid()) $$,
  '%ORDER_EXPIRED%',
  'place_order raises ORDER_EXPIRED for an unknown code');

-- Two preceding orders reserved cap1. Leave one unit so duplicate lines test aggregation.
update qkit.booths
set menu_items = jsonb_set(menu_items, '{0,stock}', '3'::jsonb)
where id = '00000000-0000-0000-0000-0000000b0004';

-- Over-cap single line: one unit remains.
select is(
  (qkit.booth_remaining_stock('00000000-0000-0000-0000-0000000b0004')->>'cap1')::int,
  1, 'duplicate-line stock fixture leaves one unit before aggregation checks');
select throws_like(
  $$ select qkit.place_order(
       'rlstestcode1', 'Bob',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":5}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_SOLD_OUT%',
  'place_order raises ORDER_SOLD_OUT for an over-cap single line');

-- Two SEPARATE line entries for the SAME capped item, each individually within
-- the remaining cap (1 each) but SUMMING over it (2 > 1) — the stock gate must
-- aggregate lines by menu item, not check each line in isolation.
select throws_like(
  $$ select qkit.place_order(
       'rlstestcode1', 'Cara',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":1},
         {"menuItemId":"cap1","name":"Capped Bun","quantity":1}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_SOLD_OUT%',
  'place_order aggregates duplicate lines for the same item before the stock gate');

-- A negative-quantity line must not net against a positive line to mask an
-- oversell — the aggregate clamps each line to >= 0 before comparing to the
-- remaining cap (qty -10 clamps to 0, so the sum is 5, not -5).
select throws_like(
  $$ select qkit.place_order(
       'rlstestcode1', 'Dev',
       '[{"menuItemId":"cap1","name":"Capped Bun","quantity":-10},
         {"menuItemId":"cap1","name":"Capped Bun","quantity":5}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_SOLD_OUT%',
  'place_order clamps a negative line instead of letting it mask an oversell');

-- ── place_order RPC hardening (0033) ─────────────────────────────────────────
-- V2 (name re-derived from the stored menu) + T2 (cost_cents omitted for a
-- no-cost item). Order free2 with a FORGED item name; the persisted item must
-- carry the menu's name and no cost_cents key.
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Gil',
       '[{"menuItemId":"free2","name":"FORGED","price_cents":999,"quantity":1}]'::jsonb,
       '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'place_order accepts a no-cost item');
select is(
  (select items->0->>'name' from qkit.orders
   where idempotency_key = '22222222-2222-2222-2222-222222222222'),
  'No-Cost Snack',
  'place_order re-derives the item name from the stored menu (V2)');
select ok(
  (select not (items->0 ? 'cost_cents') from qkit.orders
   where idempotency_key = '22222222-2222-2222-2222-222222222222'),
  'place_order omits cost_cents for a no-cost item (T2)');

-- V6: a cart whose only line is quantity 0 prices to nothing → rejected (would
-- otherwise burn an order number on a real $0 order).
select throws_like(
  $$ select qkit.place_order(
       'rlstestcode1', 'Hana',
       '[{"menuItemId":"free2","name":"No-Cost Snack","quantity":0}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_INVALID%',
  'place_order rejects an all-zero-quantity cart (V6)');

-- V3: an option not present in the item's option groups is rejected (free2 has
-- no option groups, so any option is unknown).
select throws_like(
  $$ select qkit.place_order(
       'rlstestcode1', 'Ivy',
       '[{"menuItemId":"free2","name":"No-Cost Snack","quantity":1,
          "options":[{"group":"Ghost","choice":"None"}]}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_INVALID%',
  'place_order rejects an option not in the item''s option groups (V3)');

-- ── Cross-kit customer identity (0075) ───────────────────────────────────────
-- place_order/place_walkup_order gain a genuinely optional p_customer_phone,
-- and — only when supplied — link the order to the shared merqo.customers
-- table via the guarded merqo.upsert_customer call. qkit's own isolated CI
-- Postgres has no real merqo schema (see 0075's own header), so a plain
-- lives_ok can only prove the guard doesn't crash, not that the write it
-- guards actually happens. Stub the minimal real shape here — INSIDE this
-- same rolled-back transaction, matching merqo migration 0018's
-- merqo.customers/merqo.upsert_customer exactly — so this suite can prove
-- BOTH halves of the "genuinely optional" claim: a phone-set call really
-- upserts a row, and an omitted one really never touches the table at all.
reset role;
create schema if not exists merqo;
create table if not exists merqo.customers (
  vendor_id      uuid not null,
  phone          text not null,
  name           text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (vendor_id, phone)
);
create or replace function merqo.upsert_customer(
  p_vendor_id uuid,
  p_phone text,
  p_name text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into merqo.customers (vendor_id, phone, name, first_seen_at, last_seen_at)
    values (p_vendor_id, p_phone, p_name, now(), now())
  on conflict (vendor_id, phone) do update set
    name = coalesce(excluded.name, merqo.customers.name),
    last_seen_at = excluded.last_seen_at;
end;
$$;
grant execute on function merqo.upsert_customer(uuid, text, text) to authenticated, service_role;

select is(
  (select count(*)::int from merqo.customers),
  0, 'baseline: merqo.customers is empty before any phone-linked order');

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Nora',
       '[{"menuItemId":"free1","name":"Unlimited Tea","quantity":1}]'::jsonb,
       '77777777-7777-7777-7777-777777777777'::uuid,
       '+6598765432') $$,
  'place_order accepts a supplied customer phone');
reset role;
select is(
  (select count(*)::int from merqo.customers
   where vendor_id = '00000000-0000-0000-0000-00000000000c'
     and phone = '+6598765432'),
  1, 'a phone-set order upserts exactly one row into merqo.customers');
select is(
  (select name from merqo.customers
   where vendor_id = '00000000-0000-0000-0000-00000000000c'
     and phone = '+6598765432'),
  'Nora', 'the upserted merqo.customers row carries the order''s customer name');

-- The key "genuinely optional" proof: a second order with the phone
-- OMITTED must not add or touch any merqo.customers row at all.
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode1', 'Omar',
       '[{"menuItemId":"free1","name":"Unlimited Tea","quantity":1}]'::jsonb,
       '88888888-8888-8888-8888-888888888888'::uuid) $$,
  'place_order still succeeds when the phone is omitted (genuinely optional)');
reset role;
select is(
  (select count(*)::int from merqo.customers),
  1, 'omitting the phone leaves merqo.customers untouched — still exactly the one prior row');

-- place_walkup_order shares the identical customer-write path (its own
-- header comment, 0075) — spot-check the same guarded call here too.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text,
  true);
select lives_ok(
  $$ select qkit.place_walkup_order(
       '00000000-0000-0000-0000-0000000b0004'::uuid, 'Priya',
       '[{"menuItemId":"free1","name":"Unlimited Tea","quantity":1}]'::jsonb,
       false, '+6591112222') $$,
  'place_walkup_order accepts a supplied customer phone');
reset role;
select is(
  (select count(*)::int from merqo.customers
   where vendor_id = '00000000-0000-0000-0000-00000000000c'
     and phone = '+6591112222'),
  1, 'place_walkup_order with a phone upserts into merqo.customers too');

-- submit_feedback: the only feedback insert path (public policy dropped).
-- Customer feedback is bound to the order's access token (0048) — a review must
-- carry the (booth_id, order_number, access_token) of a real order, so nobody
-- can rate a booth they never ordered from. Stash the real order's number +
-- token (readable only as the privileged role — anon has no orders SELECT) into
-- transaction-local GUCs, then submit as anon carrying them.
reset role;
select set_config('test.ord_num',
  (select order_number from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  true);
select set_config('test.ord_tok',
  (select access_token::text from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0004'
     and idempotency_key = '11111111-1111-1111-1111-111111111111'),
  true);
set local role anon;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon')::text,
  true);
select lives_ok(
  $$ select qkit.submit_feedback('customer',
       '00000000-0000-0000-0000-0000000b0004'::uuid,
       current_setting('test.ord_num'), 5, null, 'Great!',
       current_setting('test.ord_tok')::uuid) $$,
  'submit_feedback accepts a customer review bound to a real order token');
-- A mismatched token (the review-bomb path) is rejected.
select throws_like(
  $$ select qkit.submit_feedback('customer',
       '00000000-0000-0000-0000-0000000b0004'::uuid,
       current_setting('test.ord_num'), 1, null, 'Review bomb',
       gen_random_uuid()) $$,
  '%FEEDBACK_UNAUTHORIZED%',
  'submit_feedback rejects customer feedback whose token does not match an order');
reset role;
select is(
  (select count(*)::int from qkit.feedback
   where booth_id = '00000000-0000-0000-0000-0000000b0004' and message = 'Great!'),
  1, 'submit_feedback wrote exactly one feedback row');

-- submit_feedback('vendor', ...): converged to merqo.vendor_feedback (see
-- docs/superpowers/specs/2026-07-23-qkit-vendor-feedback-convergence-design.md).
-- qkit's own CI has no merqo schema, so the guarded cross-schema call
-- short-circuits — confirm the function still succeeds and, critically, no
-- longer writes a local qkit.feedback row for the vendor path.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);
select lives_ok(
  $$ select qkit.submit_feedback('vendor', null, null, null, 9, 'Love qkit!') $$,
  'submit_feedback accepts a vendor NPS submission');
reset role;
select is(
  (select count(*)::int from qkit.feedback where source = 'vendor'),
  0, 'submit_feedback no longer writes a local row for the vendor path');

-- Non-servable booth: flip is_active off (booth_servable gates on it) and
-- confirm place_order refuses with ORDER_UNSERVABLE. Flipped as the superuser
-- test role — anon has no update policy on booths — then re-entered as anon to
-- call place_order, matching the customer-facing path under test.
reset role;
update qkit.booths set is_active = false
where id = '00000000-0000-0000-0000-0000000b0004';
set local role anon;
select set_config(
  'request.jwt.claims',
  json_build_object('role', 'anon')::text,
  true);
select throws_like(
  $$ select qkit.place_order(
       'rlstestcode1', 'Fay',
       '[{"menuItemId":"free1","name":"Unlimited Tea","quantity":1}]'::jsonb,
       gen_random_uuid()) $$,
  '%ORDER_UNSERVABLE%',
  'place_order raises ORDER_UNSERVABLE for a non-servable booth');

reset role;

-- Maintenance banner (0058): a public-read singleton, same "no write policy,
-- writes go through the service-role admin action only" shape as qkit.pricing.
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select isnt_empty(
  $$ select 1 from qkit.platform_settings where id = 1 $$,
  'anon can read platform_settings');
select throws_ok(
  $$ update qkit.platform_settings set banner_enabled = true where id = 1 $$,
  '42501',
  null,
  'anon cannot write platform_settings (no UPDATE policy, RLS default-denies)');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);
select isnt_empty(
  $$ select 1 from qkit.platform_settings where id = 1 $$,
  'authenticated can read platform_settings');
select throws_ok(
  $$ update qkit.platform_settings set banner_enabled = true where id = 1 $$,
  '42501',
  null,
  'authenticated (a real vendor, not an admin) cannot write platform_settings either');

reset role;

-- ── legal_check_state (0084): service-role-only TTL cache, no client access ───
-- Same shape as rate_limits / booth_item_sold: RLS on, zero policies, only the
-- service-role client (src/lib/legal-gate.ts) touches it.
select ok(
  (select relrowsecurity from pg_class where oid = 'qkit.legal_check_state'::regclass),
  'RLS on legal_check_state');
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'qkit' and tablename = 'legal_check_state'),
  0, 'legal_check_state has no RLS policies (service-role-only)');

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select throws_ok(
  $$ select 1 from qkit.legal_check_state limit 1 $$,
  null,
  'anon cannot SELECT legal_check_state directly');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);
select throws_ok(
  $$ select 1 from qkit.legal_check_state limit 1 $$,
  null,
  'authenticated cannot SELECT legal_check_state directly');

reset role;

-- ── service_role cannot rewrite or erase admin_audit/order_status_events (0079) ──
-- RLS never binds service_role (BYPASSRLS), so the guarantee here is the
-- table-level REVOKE from 0079, checked independently of, and before, any
-- RLS policy. select/insert stay granted (recordAudit and
-- recordOrderStatusEvent both still need to write new rows).
insert into qkit.admin_audit (id, admin_id, action, target_id, detail)
values (
  '00000000-0000-0000-0000-0000000e0001',
  '00000000-0000-0000-0000-00000000000a',
  'advance_order_status',
  '00000000-0000-0000-0000-00000000d001',
  '{"from":"pending","to":"confirmed"}'::jsonb);

insert into qkit.order_status_events (id, order_id, from_status, to_status, actor)
values (
  '00000000-0000-0000-0000-0000000f0001',
  '00000000-0000-0000-0000-00000000d001',
  'pending',
  'confirmed',
  '00000000-0000-0000-0000-00000000000a');

set local role service_role;
select lives_ok(
  $$ insert into qkit.admin_audit (admin_id, action, target_id, detail)
     values ('00000000-0000-0000-0000-00000000000a', 'set_vendor_plan', null, '{}'::jsonb) $$,
  'service_role can insert an admin_audit row');
select throws_ok(
  $$ update qkit.admin_audit set detail = '{"tampered":true}'::jsonb
     where id = '00000000-0000-0000-0000-0000000e0001' $$,
  '42501',
  null,
  'service_role cannot UPDATE admin_audit (0079 revoke)');
select throws_ok(
  $$ delete from qkit.admin_audit where id = '00000000-0000-0000-0000-0000000e0001' $$,
  '42501',
  null,
  'service_role cannot DELETE admin_audit (0079 revoke)');

select lives_ok(
  $$ insert into qkit.order_status_events (order_id, from_status, to_status, actor)
     values ('00000000-0000-0000-0000-00000000d001', 'confirmed', 'preparing',
             '00000000-0000-0000-0000-00000000000a') $$,
  'service_role can insert an order_status_events row');
select throws_ok(
  $$ update qkit.order_status_events set to_status = 'tampered'
     where id = '00000000-0000-0000-0000-0000000f0001' $$,
  '42501',
  null,
  'service_role cannot UPDATE order_status_events (0079 revoke)');
select throws_ok(
  $$ delete from qkit.order_status_events where id = '00000000-0000-0000-0000-0000000f0001' $$,
  '42501',
  null,
  'service_role cannot DELETE order_status_events (0079 revoke)');

reset role;

-- ── Payment-first order numbering (0087) ─────────────────────────────────────
-- A payment-required order must never get a number or auto-start into
-- preparing at creation, even at a booth that would otherwise auto-start
-- (printer connected, no arrival-confirm gate). A fresh vendor/booth here so
-- this section doesn't depend on booth 0004's print_enabled/payment state,
-- which earlier tests have already flipped back and forth.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000d',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-d@test.local');

insert into qkit.vendors (id)
values ('00000000-0000-0000-0000-00000000000d');

insert into qkit.booths (
  id, vendor_id, name, is_active, short_code, print_enabled,
  requires_arrival_confirm, payment, menu_items
)
values (
  '00000000-0000-0000-0000-0000000b0005',
  '00000000-0000-0000-0000-00000000000d',
  'D Payment Booth', true, 'rlstestcode2', true, false,
  '{"kind":"paynow","payee_name":"D","uen":"53312345D"}'::jsonb,
  '[{"id":"pay1","name":"Paid Item","description":"","price_cents":500,
     "available":true}]'::jsonb
);

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode2', 'Pat',
       '[{"menuItemId":"pay1","name":"Paid Item","quantity":1}]'::jsonb,
       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid) $$,
  'place_order succeeds for a payment-required order');

reset role;
select is(
  (select order_number from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0005'
     and idempotency_key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  NULL,
  'payment-required order has no order_number at creation'
);
select is(
  (select status::text from qkit.orders
   where booth_id = '00000000-0000-0000-0000-0000000b0005'
     and idempotency_key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'pending',
  'payment-required order forced to pending even when booth auto-starts'
);

-- assign_order_number: assigns once, idempotent on retry.
select is(
  qkit.assign_order_number(
    (select id from qkit.orders
     where booth_id = '00000000-0000-0000-0000-0000000b0005'
       and idempotency_key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  qkit.assign_order_number(
    (select id from qkit.orders
     where booth_id = '00000000-0000-0000-0000-0000000b0005'
       and idempotency_key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  'assign_order_number is idempotent for the same order'
);

-- The freeze trigger's order_number carve-out (0087) only permits the ONE
-- NULL -> assigned transition assign_order_number performs above; changing
-- an already-set number, or erasing it back to NULL, must still be blocked
-- exactly like every other frozen column.
select throws_like(
  $$ update qkit.orders set order_number = '9999'
     where booth_id = '00000000-0000-0000-0000-0000000b0005'
       and idempotency_key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'cannot change an already-assigned order_number to a different value');
select throws_like(
  $$ update qkit.orders set order_number = NULL
     where booth_id = '00000000-0000-0000-0000-0000000b0005'
       and idempotency_key = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '%ORDER_IMMUTABLE_COLUMN%',
  'cannot erase an already-assigned order_number back to NULL');

-- 0088: the freeze trigger alone doesn't stop a vendor from setting a still-
-- NULL order_number directly, since it only exempts that one transition --
-- the actual gate is authenticated's column grant, tested here as vendor D.
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select lives_ok(
  $$ select qkit.place_order(
       'rlstestcode2', 'Sam',
       '[{"menuItemId":"pay1","name":"Paid Item","quantity":1}]'::jsonb,
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid) $$,
  'place_order succeeds for a second payment-required order');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-00000000000d',
    'role', 'authenticated'
  )::text,
  true);
select throws_like(
  $$ update qkit.orders set order_number = '9999'
     where booth_id = '00000000-0000-0000-0000-0000000b0005'
       and idempotency_key = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  '%permission denied%',
  'authenticated cannot assign order_number directly, even from NULL');

-- 0091: printkit_location_id is not writable by a vendor. No application
-- code writes it; the column and this revoke stay -- vendor D still owns
-- this booth here.
select throws_like(
  $$ update qkit.booths set printkit_location_id = 'fake-loc'
     where id = '00000000-0000-0000-0000-0000000b0005' $$,
  '%permission denied%',
  'authenticated cannot set printkit_location_id directly');
reset role;

-- storage: no anon/public read on payment-proofs. Seed a real row as the
-- privileged test role first, so the anon check below proves RLS actually
-- filters it out, not just that the bucket happens to be empty. anon has the
-- platform's default full table grant on storage.objects (same as every
-- other bucket) -- with no matching SELECT policy, RLS silently returns zero
-- rows rather than throwing, so is_empty is the correct assertion here (not
-- throws_ok, which only fits a table-level grant revoke).
insert into storage.objects (bucket_id, name)
values ('payment-proofs', '00000000-0000-0000-0000-00000000000d/proof.jpg');

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'payment-proofs' $$,
  'anon cannot read payment-proofs bucket objects'
);
reset role;

-- storage: payment-proofs enforces its own size and MIME limits (migration
-- 0093), so an upload that skips the browser resize and claimPayment's
-- validation is still bounded at the storage layer.
select is(
  (select file_size_limit from storage.buckets where id = 'payment-proofs'),
  1048576::bigint,
  'payment-proofs caps objects at 1 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'payment-proofs'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'payment-proofs accepts only JPEG, PNG and WebP'
);

-- booths.daily_cup_cap (migration 0094): the cap is enforced by the
-- orders_daily_cup_cap trigger, not by app code, so it must hold for every
-- insert path. Counted in cups (the sum of item quantities), not orders.
insert into qkit.booths (id, vendor_id, name, is_active, daily_cup_cap)
values
  ('00000000-0000-0000-0000-0000000b0009',
   '00000000-0000-0000-0000-00000000000a', 'Capped Booth', true, 5);

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('00000000-0000-0000-0000-0000000b0009', 'C-001', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":4}]'::jsonb, 400) $$,
  'an order within the cup cap is accepted'
);

select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('00000000-0000-0000-0000-0000000b0009', 'C-002', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":2}]'::jsonb, 200) $$,
  'P0001',
  NULL,
  'an order that would cross the cup cap is refused'
);

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('00000000-0000-0000-0000-0000000b0009', 'C-003', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":1}]'::jsonb, 100) $$,
  'an order that exactly fills the cup cap is accepted'
);

select is(
  qkit.booth_cups_today('00000000-0000-0000-0000-0000000b0009'),
  5,
  'booth_cups_today sums item quantities, not order rows'
);

select is(
  qkit.booth_cups_left('00000000-0000-0000-0000-0000000b0009'),
  0,
  'booth_cups_left reaches zero once the cap is full'
);

-- Cancelling an order returns its cups: a vendor who voids a mistake should
-- not lose stock to it.
update qkit.orders set status = 'cancelled'
where booth_id = '00000000-0000-0000-0000-0000000b0009' and order_number = 'C-001';

select is(
  qkit.booth_cups_today('00000000-0000-0000-0000-0000000b0009'),
  1,
  'a cancelled order releases its cups'
);

select is(
  qkit.booth_cups_left('00000000-0000-0000-0000-0000000b0001'),
  NULL,
  'booth_cups_left is null for a booth with no cap'
);

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('00000000-0000-0000-0000-0000000b0001', 'A-900', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":99}]'::jsonb, 9900) $$,
  'a booth with no cap is never limited'
);

-- Basket holds and the per-order item limit (migration 0096). A hold is soft:
-- it lowers what OTHER baskets are shown and never blocks an order, so these
-- check the availability a customer is given, not what an insert allows.
insert into qkit.booths (id, vendor_id, name, is_active, daily_cup_cap,
                         max_items_per_order, menu_items)
values
  ('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-00000000000a', 'Held Booth', true, 5, 3,
   '[{"id":"kopi","name":"Kopi","available":true,"stock":2},
     {"id":"teh","name":"Teh","available":true}]'::jsonb),
  ('00000000-0000-0000-0000-0000000b0012', '00000000-0000-0000-0000-00000000000a', 'Limited Booth', true,
   null, 3,
   '[{"id":"teh","name":"Teh","available":true}]'::jsonb);

select is(
  qkit.hold_cart('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501',
    '[{"menuItemId":"kopi","quantity":2},{"menuItemId":"teh","quantity":1}]'::jsonb
  )->>'left',
  '5',
  'a basket is not blocked by its own hold'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5502')->'remaining'->>'kopi',
  '0',
  'another basket sees held stock as not available'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5502')->'held'->>'kopi',
  '2',
  'and is told it is held, not sold'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5502')->>'left',
  '2',
  'a hold counts against the booth daily total for other baskets'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5502')->>'left_held',
  '3',
  'left_held reports how much of the daily total is held'
);

select qkit.hold_cart('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5502',
  '[{"menuItemId":"kopi","quantity":1},{"menuItemId":"teh","quantity":5}]'::jsonb);

select is(
  (select items from qkit.cart_holds
   where booth_id = '00000000-0000-0000-0000-0000000b0011' and session_id = '00000000-0000-0000-0000-0000000e5502'),
  '{"teh": 2}'::jsonb,
  'a second basket is granted only what the first has not claimed'
);

select qkit.hold_cart('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501', '[]'::jsonb);

select is(
  (select count(*)::int from qkit.cart_holds
   where booth_id = '00000000-0000-0000-0000-0000000b0011' and session_id = '00000000-0000-0000-0000-0000000e5501'),
  0,
  'an empty basket releases its hold'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501')->>'left',
  '3',
  'a live hold from another basket is subtracted'
);

update qkit.cart_holds set expires_at = now() - interval '1 minute'
where booth_id = '00000000-0000-0000-0000-0000000b0011' and session_id = '00000000-0000-0000-0000-0000000e5502';

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501')->>'left',
  '5',
  'an expired hold no longer counts'
);

select lives_ok(
  $$ select qkit.hold_cart('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501', '{"x":1}'::jsonb) $$,
  'a basket that is not an array is ignored, not raised on'
);

select lives_ok(
  $$ select qkit.hold_cart('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501',
       '[{"menuItemId":"kopi","quantity":"abc"}, 7]'::jsonb) $$,
  'a malformed line is ignored, not raised on'
);

select qkit.hold_cart('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501',
  '[{"menuItemId":"not-on-the-menu","quantity":2}]'::jsonb);

select is(
  (select count(*)::int from qkit.cart_holds
   where booth_id = '00000000-0000-0000-0000-0000000b0011' and session_id = '00000000-0000-0000-0000-0000000e5501'),
  0,
  'an item that is not on the booth menu holds nothing'
);

select qkit.hold_cart('00000000-0000-0000-0000-0000000b0012', '00000000-0000-0000-0000-0000000e5501',
  '[{"menuItemId":"teh","quantity":1}]'::jsonb);

select is(
  (select count(*)::int from qkit.cart_holds where booth_id = '00000000-0000-0000-0000-0000000b0012'),
  0,
  'a booth with no finite stock stores no hold'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000b0012', NULL)->>'max_per_order',
  '3',
  'booth_availability reports the per-order limit'
);

select is(
  qkit.booth_availability('00000000-0000-0000-0000-0000000bffff', NULL),
  NULL,
  'booth_availability is null for an unknown booth'
);

set local role anon;

select throws_ok(
  $$ select * from qkit.cart_holds $$,
  '42501',
  NULL,
  'anon cannot read basket holds directly'
);

select lives_ok(
  $$ select qkit.booth_availability('00000000-0000-0000-0000-0000000b0011', '00000000-0000-0000-0000-0000000e5501') $$,
  'anon can read availability through the RPC'
);

reset role;

select throws_like(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('00000000-0000-0000-0000-0000000b0012', 'L-001', 'Cust',
             '[{"menuItemId":"teh","name":"Teh","quantity":4}]'::jsonb, 400) $$,
  'ORDER_TOO_LARGE%',
  'a customer order over the per-order limit is refused'
);

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('00000000-0000-0000-0000-0000000b0012', 'L-002', 'Cust',
             '[{"menuItemId":"teh","name":"Teh","quantity":3}]'::jsonb, 300) $$,
  'a customer order at the per-order limit is accepted'
);

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
     values ('00000000-0000-0000-0000-0000000b0012', 'L-003', 'Cust',
             '[{"menuItemId":"teh","name":"Teh","quantity":4}]'::jsonb, 400, 'walkup') $$,
  'a walk-up order the vendor enters is not limited'
);

-- qkit.sweep_stale_orders (migration 0097): the scheduled twin of the board's
-- own sweeps, for when no vendor has a board open.
insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents,
                         status, payment_status, created_at)
values
  ('00000000-0000-0000-0000-0000000b0012', 'S-001', 'Cust', '[{"menuItemId":"teh","name":"Teh","quantity":1}]'::jsonb,
   100, 'pending', 'pending', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000b0012', 'S-002', 'Cust', '[{"menuItemId":"teh","name":"Teh","quantity":1}]'::jsonb,
   100, 'pending', 'pending', now() - interval '5 minutes');

update qkit.vendors
set board_settings = coalesce(board_settings, '{}'::jsonb)
                     || '{"ready_auto_clear_min": 5}'::jsonb
where id = '00000000-0000-0000-0000-00000000000a';

insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents,
                         status, ready_at)
values
  ('00000000-0000-0000-0000-0000000b0012', 'S-003', 'Cust', '[{"menuItemId":"teh","name":"Teh","quantity":1}]'::jsonb,
   100, 'ready', now() - interval '10 minutes');

select qkit.sweep_stale_orders();

select is(
  (select status::text from qkit.orders where booth_id = '00000000-0000-0000-0000-0000000b0012' and order_number = 'S-001'),
  'cancelled',
  'the sweep cancels a QR order unpaid for over 30 minutes'
);

select is(
  (select status::text from qkit.orders where booth_id = '00000000-0000-0000-0000-0000000b0012' and order_number = 'S-002'),
  'pending',
  'the sweep leaves an order still inside its payment window'
);

select is(
  (select status::text || ':' || auto_completed::text
   from qkit.orders where booth_id = '00000000-0000-0000-0000-0000000b0012' and order_number = 'S-003'),
  'completed:true',
  'the sweep clears a ready order past the vendor auto-clear time'
);

select is(
  (select count(*)::int from qkit.order_status_events e
   join qkit.orders o on o.id = e.order_id
   where o.booth_id = '00000000-0000-0000-0000-0000000b0012' and o.order_number in ('S-001', 'S-003')),
  2,
  'each swept order gets a status event'
);

select * from finish();
rollback;
