begin;
select no_plan();

select has_index('qkit', 'admin_audit', 'admin_audit_admin_id_idx', 'qkit.admin_audit (admin_id) is indexed');
select has_index('qkit', 'feedback', 'feedback_vendor_id_idx', 'qkit.feedback (vendor_id) is indexed');
select has_index('qkit', 'order_status_events', 'order_status_events_actor_idx', 'qkit.order_status_events (actor) is indexed');
select has_index('qkit', 'payments', 'payments_license_id_idx', 'qkit.payments (license_id) is indexed');
select has_index('qkit', 'purchase_requests', 'purchase_requests_vendor_id_idx', 'qkit.purchase_requests (vendor_id) is indexed');

select is(
  (select count(*)::int from pg_tables where schemaname = 'qkit' and not rowsecurity),
  0, 'every qkit table has row level security on');

-- payments: a vendor reads only their own; rate_limits and booth_item_sold are server-only.
insert into auth.users (id, instance_id, aud, role, email) values
  ('a0000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hygiene-a@test.local'),
  ('a0000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hygiene-b@test.local');
insert into qkit.vendors (id) values
  ('a0000000-0000-0000-0000-00000000a101'), ('a0000000-0000-0000-0000-00000000a102')
  on conflict (id) do nothing;
insert into qkit.payments (vendor_id, kind, amount_cents, note)
  values ('a0000000-0000-0000-0000-00000000a101', 'pass', 0, 'hygiene_probe');

select ok(not has_table_privilege(r, t, p), r || ' has no ' || p || ' on ' || t)
from unnest(array['anon', 'authenticated']) r,
     unnest(array['qkit.rate_limits', 'qkit.booth_item_sold']) t,
     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
select ok(not has_table_privilege('anon', 'qkit.payments', p), 'anon has no ' || p || ' on qkit.payments')
from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
select ok(not has_table_privilege('authenticated', 'qkit.payments', p), 'authenticated has no ' || p || ' on qkit.payments')
from unnest(array['INSERT', 'UPDATE', 'DELETE']) p;

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select throws_ok($$ select 1 from qkit.rate_limits $$, '42501', null, 'anon cannot read qkit.rate_limits');
select throws_ok($$ select 1 from qkit.booth_item_sold $$, '42501', null, 'anon cannot read qkit.booth_item_sold');
select throws_ok($$ select 1 from qkit.payments $$, '42501', null, 'anon cannot read qkit.payments');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-0000-0000-00000000a102', 'role', 'authenticated')::text, true);
select is((select count(*)::int from qkit.payments where note = 'hygiene_probe'), 0, 'another vendor reads none of the payments');
select throws_ok($$ select 1 from qkit.rate_limits $$, '42501', null, 'authenticated cannot read qkit.rate_limits');
select throws_ok($$ select 1 from qkit.booth_item_sold $$, '42501', null, 'authenticated cannot read qkit.booth_item_sold');
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-0000-0000-00000000a101', 'role', 'authenticated')::text, true);
select is((select count(*)::int from qkit.payments where note = 'hygiene_probe'), 1, 'the vendor reads their own payment');
reset role;

select * from finish();
rollback;
