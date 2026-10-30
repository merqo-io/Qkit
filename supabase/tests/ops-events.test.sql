-- ops_events (0108): service-role only, kind/ref checks, 30-day purge.
begin;
select no_plan();

select has_table('qkit', 'ops_events', 'qkit.ops_events exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'qkit.ops_events'::regclass),
  'RLS is enabled on ops_events');

select ok(not has_table_privilege(role, 'qkit.ops_events', priv),
  role || ' has no ' || priv || ' on ops_events')
from unnest(array['anon', 'authenticated']) as role,
     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv;

select ok(has_table_privilege('service_role', 'qkit.ops_events', priv),
  'service_role has ' || priv || ' on ops_events')
from unnest(array['SELECT', 'INSERT']) as priv;

select ok(not has_function_privilege(role, 'qkit.purge_ops_events()', 'EXECUTE'),
  role || ' cannot run the purge')
from unnest(array['anon', 'authenticated']) as role;

-- Fixtures (superuser, RLS bypassed).
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000f0001',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'ops-vendor@test.local');
insert into qkit.vendors (id) values ('00000000-0000-0000-0000-0000000f0001');

set local role anon;
select throws_ok(
  $$select * from qkit.ops_events$$, '42501', null, 'anon cannot select');
select throws_ok(
  $$insert into qkit.ops_events (vendor_id, kind, ref, code)
    values ('00000000-0000-0000-0000-0000000f0001', 'action_error', 'r', 'c')$$,
  '42501', null, 'anon cannot insert');
reset role;

set local role authenticated;
select throws_ok(
  $$select * from qkit.ops_events$$, '42501', null, 'authenticated cannot select');
select throws_ok(
  $$insert into qkit.ops_events (vendor_id, kind, ref, code)
    values ('00000000-0000-0000-0000-0000000f0001', 'action_error', 'r', 'c')$$,
  '42501', null, 'authenticated cannot insert');
reset role;

select throws_ok(
  $$insert into qkit.ops_events (vendor_id, kind, ref, code)
    values ('00000000-0000-0000-0000-0000000f0001', 'other', 'r', 'c')$$,
  '23514', null, 'kind check rejects other');
select throws_ok(
  $$insert into qkit.ops_events (vendor_id, kind, ref, code)
    values ('00000000-0000-0000-0000-0000000f0001', 'payment_claim_stuck', 'r', 'c')$$,
  '23514', null, 'kind check rejects a kind qkit does not write');
select throws_ok(
  format($$insert into qkit.ops_events (vendor_id, kind, ref, code)
    values ('00000000-0000-0000-0000-0000000f0001', 'action_error', %L, 'c')$$,
    repeat('x', 65)),
  '23514', null, 'a 65-char ref is rejected');

insert into qkit.ops_events (vendor_id, kind, ref, code, created_at)
values
  ('00000000-0000-0000-0000-0000000f0001', 'action_error', 'old', 'advanceOrder',
   now() - interval '31 days'),
  ('00000000-0000-0000-0000-0000000f0001', 'webhook_rejected', 'recent',
   'signature_invalid', now() - interval '29 days');

select qkit.purge_ops_events();

select is(
  (select count(*)::int from qkit.ops_events where ref = 'old'), 0,
  'purge deletes a 31-day-old row');
select is(
  (select count(*)::int from qkit.ops_events where ref = 'recent'), 1,
  'purge keeps a 29-day-old row');

select * from finish();
rollback;
