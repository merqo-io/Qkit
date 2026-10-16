-- order_push_subscriptions (0105): service-role only, and a finished order's
-- subscriptions are dropped by trigger.
begin;
select no_plan();

select ok(not has_table_privilege(role, 'qkit.order_push_subscriptions', priv),
  role || ' has no ' || priv || ' on push subscriptions')
from unnest(array['anon', 'authenticated']) as role,
     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv;

select ok(has_table_privilege('service_role', 'qkit.order_push_subscriptions', priv),
  'service_role has ' || priv || ' on push subscriptions')
from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv;

select ok(
  (select relrowsecurity from pg_class
   where oid = 'qkit.order_push_subscriptions'::regclass),
  'RLS is enabled on push subscriptions');

select ok(not has_function_privilege(role,
  'qkit.drop_finished_order_push_subscriptions()', 'EXECUTE'),
  role || ' cannot call the cleanup trigger function')
from unnest(array['anon', 'authenticated']) as role;

-- Fixtures (superuser, RLS bypassed).
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000e0001',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'push-vendor@test.local');
insert into qkit.vendors (id) values ('00000000-0000-0000-0000-0000000e0001');
insert into qkit.booths (id, vendor_id, name, is_active)
values ('00000000-0000-0000-0000-0000000e0b01',
        '00000000-0000-0000-0000-0000000e0001', 'Push Booth', false);
insert into qkit.orders (id, booth_id, order_number, customer_name, items,
                         total_cents, status)
values
  ('00000000-0000-0000-0000-0000000e0d01', '00000000-0000-0000-0000-0000000e0b01',
   'P-001', 'Cust', '[{"menuItemId":"teh","name":"Teh","quantity":1}]'::jsonb,
   100, 'preparing'),
  ('00000000-0000-0000-0000-0000000e0d02', '00000000-0000-0000-0000-0000000e0b01',
   'P-002', 'Cust', '[{"menuItemId":"teh","name":"Teh","quantity":1}]'::jsonb,
   100, 'preparing');
insert into qkit.order_push_subscriptions
  (order_id, endpoint, p256dh, auth, title, body, url, tag)
values
  ('00000000-0000-0000-0000-0000000e0d01', 'https://fcm.googleapis.com/a',
   'p', 'a', 't', 'b', '/u', 'qkit-order-1'),
  ('00000000-0000-0000-0000-0000000e0d02', 'https://fcm.googleapis.com/b',
   'p', 'a', 't', 'b', '/u', 'qkit-order-2');

update qkit.orders set status = 'ready'
where id = '00000000-0000-0000-0000-0000000e0d01';
select is(
  (select count(*)::int from qkit.order_push_subscriptions
   where order_id = '00000000-0000-0000-0000-0000000e0d01'),
  1, 'a ready order keeps its subscription');

update qkit.orders set status = 'completed'
where id = '00000000-0000-0000-0000-0000000e0d01';
select is(
  (select count(*)::int from qkit.order_push_subscriptions
   where order_id = '00000000-0000-0000-0000-0000000e0d01'),
  0, 'completing an order drops its subscriptions');

update qkit.orders set status = 'cancelled'
where id = '00000000-0000-0000-0000-0000000e0d02';
select is(
  (select count(*)::int from qkit.order_push_subscriptions), 0,
  'cancelling an order drops its subscriptions');

select * from finish();
rollback;
