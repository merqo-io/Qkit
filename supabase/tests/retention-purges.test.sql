-- Migration 0118: orders.idempotency_key purge after 24 hours, and the freeze
-- trigger exception that lets only the purge clear it. Fixtures roll back.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values ('01180000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'retention-vendor@test.local');
insert into qkit.vendors (id)
values ('01180000-0000-0000-0000-000000000001');
insert into qkit.vendor_entitlements (vendor_id, tier, stats_window, issued_at)
values ('01180000-0000-0000-0000-000000000001', 'qkit', '90d', now());
insert into qkit.booths (id, vendor_id, name, short_code, payment, daily_cup_cap, menu_items)
values ('01180000-0000-0000-0000-0000000000b1', '01180000-0000-0000-0000-000000000001',
        'Retention', 'retain01', null, null,
        '[{"id":"coffee","name":"Coffee","available":true,"price_cents":500}]');

insert into qkit.orders (id, booth_id, customer_name, items, total_cents, status,
                         payment_status, idempotency_key, created_at)
values
  ('01180000-0000-0000-0000-0000000000a1', '01180000-0000-0000-0000-0000000000b1',
   'Old', '[{"menuItemId":"coffee","quantity":1}]', 500, 'pending', 'pending',
   'key-old', now() - interval '25 hours'),
  ('01180000-0000-0000-0000-0000000000a2', '01180000-0000-0000-0000-0000000000b1',
   'Recent', '[{"menuItemId":"coffee","quantity":1}]', 500, 'pending', 'pending',
   'key-recent', now() - interval '23 hours'),
  ('01180000-0000-0000-0000-0000000000a3', '01180000-0000-0000-0000-0000000000b1',
   'Nokey', '[{"menuItemId":"coffee","quantity":1}]', 500, 'pending', 'pending',
   null, now() - interval '48 hours');

select ok(not has_function_privilege(role, 'qkit.purge_order_idempotency_keys()', 'EXECUTE'),
  role || ' cannot run the idempotency purge')
from unnest(array['anon', 'authenticated']) as role;
select ok(has_function_privilege('service_role', 'qkit.purge_order_idempotency_keys()', 'EXECUTE'),
  'service_role can run the idempotency purge');

-- Direct writes stay frozen without the purge flag.
select throws_ok(
  $$update qkit.orders set idempotency_key = null
    where id = '01180000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'clearing the key directly still raises ORDER_IMMUTABLE_COLUMN');
select throws_ok(
  $$update qkit.orders set idempotency_key = 'other'
    where id = '01180000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'changing the key directly still raises');

-- Even with the flag on, only non-NULL -> NULL is allowed.
select set_config('qkit.retention_purge', 'on', true);
select throws_ok(
  $$update qkit.orders set idempotency_key = 'other'
    where id = '01180000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'changing the key to another value raises with the flag on');
select throws_ok(
  $$update qkit.orders set idempotency_key = 'new'
    where id = '01180000-0000-0000-0000-0000000000a3'$$,
  'P0001', null, 'setting a key on a keyless order raises with the flag on');
select throws_ok(
  $$update qkit.orders set total_cents = 1
    where id = '01180000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'total_cents stays frozen with the flag on');
select throws_ok(
  $$update qkit.orders set customer_name = 'x'
    where id = '01180000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'customer_name stays frozen with the flag on');
select throws_ok(
  $$update qkit.orders set created_at = now()
    where id = '01180000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'created_at stays frozen with the flag on');
select set_config('qkit.retention_purge', 'off', true);

select is(
  qkit.purge_order_idempotency_keys(), 1,
  'purge returns the number of keys cleared');
select is(
  (select idempotency_key from qkit.orders
    where id = '01180000-0000-0000-0000-0000000000a1'), null,
  'purge clears a key on a 25-hour-old order');
select is(
  (select idempotency_key from qkit.orders
    where id = '01180000-0000-0000-0000-0000000000a2'), 'key-recent',
  'purge keeps a key on a 23-hour-old order');
select is(
  qkit.purge_order_idempotency_keys(), 0,
  'a second purge finds nothing to clear');
select is(current_setting('qkit.retention_purge', true), 'off',
  'the purge leaves the flag off');

select throws_ok(
  $$update qkit.orders set idempotency_key = null
    where id = '01180000-0000-0000-0000-0000000000a2'$$,
  'P0001', null, 'direct clearing is still blocked after the purge ran');

select * from finish();
rollback;
