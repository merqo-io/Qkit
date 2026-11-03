-- Entitlement cache, SQL helpers and free-tier menu caps (0112-0114).
-- Fixtures roll back with the transaction.
begin;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email) values
 ('00e10000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ent-free@test.local'),
 ('00e10000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ent-starter@test.local'),
 ('00e10000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ent-qkit@test.local'),
 ('00e10000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ent-lapsed@test.local'),
 ('00e10000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ent-pass@test.local'),
 ('00e10000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ent-future-pass@test.local');
insert into qkit.vendors(id) values
 ('00e10000-0000-0000-0000-000000000001'),
 ('00e10000-0000-0000-0000-000000000002'),
 ('00e10000-0000-0000-0000-000000000003'),
 ('00e10000-0000-0000-0000-000000000004'),
 ('00e10000-0000-0000-0000-000000000005'),
 ('00e10000-0000-0000-0000-000000000006');

-- Privileges: the writer is service-role only.
select ok(not has_function_privilege('authenticated', 'qkit.apply_vendor_entitlement(uuid,text,boolean,text,timestamptz,timestamptz,timestamptz,timestamptz)', 'EXECUTE'),
  'authenticated cannot call apply_vendor_entitlement');
select ok(has_function_privilege('service_role', 'qkit.apply_vendor_entitlement(uuid,text,boolean,text,timestamptz,timestamptz,timestamptz,timestamptz)', 'EXECUTE'),
  'service_role can call apply_vendor_entitlement');
select ok(not has_function_privilege('authenticated', 'qkit.vendor_effective_tier(uuid)', 'EXECUTE'),
  'authenticated cannot call vendor_effective_tier');

-- apply_vendor_entitlement: first write, newer wins, stale and replayed are no-ops.
select is(qkit.apply_vendor_entitlement('00e10000-0000-0000-0000-000000000002','starter',false,'24h',null,null,null,'2026-11-01T00:00:00Z'),
  true, 'a first push is written');
select is(qkit.apply_vendor_entitlement('00e10000-0000-0000-0000-000000000002','qkit',true,'90d',null,null,null,'2026-11-02T00:00:00Z'),
  true, 'a newer push overwrites');
select is((select tier from qkit.vendor_entitlements where vendor_id='00e10000-0000-0000-0000-000000000002'),
  'qkit', 'the newer tier is stored');
select is(qkit.apply_vendor_entitlement('00e10000-0000-0000-0000-000000000002','free',false,'24h',null,null,null,'2026-11-01T12:00:00Z'),
  false, 'a stale push is a no-op');
select is(qkit.apply_vendor_entitlement('00e10000-0000-0000-0000-000000000002','free',false,'24h',null,null,null,'2026-11-02T00:00:00Z'),
  false, 'a replay of the same issued_at is a no-op');
select is((select tier from qkit.vendor_entitlements where vendor_id='00e10000-0000-0000-0000-000000000002'),
  'qkit', 'stale and replayed pushes leave the cache unchanged');

-- Table checks reject out-of-contract values.
select throws_ok($$ select qkit.apply_vendor_entitlement('00e10000-0000-0000-0000-000000000001','gold',false,'24h',null,null,null,now()) $$,
  null, null, 'an unknown tier is rejected');
select throws_ok($$ select qkit.apply_vendor_entitlement('00e10000-0000-0000-0000-000000000001','free',false,'1y',null,null,null,now()) $$,
  null, null, 'an unknown stats window is rejected');

-- Helpers: effective tier, pass window and the derived predicates.
insert into qkit.vendor_entitlements(vendor_id,tier,stats_window,valid_until,event_pass_starts_at,event_pass_ends_at,issued_at) values
 ('00e10000-0000-0000-0000-000000000003','qkit','90d',now()+interval '30 day',null,null,now()),
 ('00e10000-0000-0000-0000-000000000004','qkit','90d',now()-interval '1 day',null,null,now()),
 ('00e10000-0000-0000-0000-000000000005','free','24h',null,now()-interval '1 hour',now()+interval '1 hour',now()),
 ('00e10000-0000-0000-0000-000000000006','free','24h',null,now()+interval '1 day',now()+interval '2 day',now());

select is(qkit.vendor_effective_tier('00e10000-0000-0000-0000-000000000001'), 'free', 'no row is the free tier');
select is(qkit.vendor_effective_tier('00e10000-0000-0000-0000-000000000003'), 'qkit', 'an unexpired qkit tier holds');
select is(qkit.vendor_effective_tier('00e10000-0000-0000-0000-000000000004'), 'free', 'a lapsed qkit tier falls back to free');
select ok(qkit.vendor_entitled('00e10000-0000-0000-0000-000000000003'), 'qkit tier is entitled');
select ok(not qkit.vendor_entitled('00e10000-0000-0000-0000-000000000004'), 'a lapsed qkit tier is not entitled');
select ok(qkit.vendor_entitled('00e10000-0000-0000-0000-000000000002'), 'a pushed qkit tier with no expiry is entitled');
select ok(qkit.vendor_pass_running('00e10000-0000-0000-0000-000000000005'), 'a running pass is detected');
select ok(qkit.vendor_entitled('00e10000-0000-0000-0000-000000000005'), 'a running pass grants qkit capability');
select ok(not qkit.vendor_pass_running('00e10000-0000-0000-0000-000000000006'), 'a future pass is not running');
select ok(not qkit.vendor_entitled('00e10000-0000-0000-0000-000000000006'), 'a future pass grants nothing yet');
select ok(qkit.vendor_has_free_caps('00e10000-0000-0000-0000-000000000001'), 'a free vendor is capped');
select ok(not qkit.vendor_has_free_caps('00e10000-0000-0000-0000-000000000005'), 'a running pass lifts the caps');
select ok(not qkit.vendor_has_free_caps('00e10000-0000-0000-0000-000000000003'), 'qkit tier is not capped');

-- Menu caps: 6 items and 3 option groups per item, free tier only.
insert into qkit.booths(id,vendor_id,name) values
 ('00e10000-0000-0000-0000-0000000000a1','00e10000-0000-0000-0000-000000000001','free booth'),
 ('00e10000-0000-0000-0000-0000000000a2','00e10000-0000-0000-0000-000000000003','qkit booth');

select lives_ok($$ update qkit.booths set menu_items = (select jsonb_agg(jsonb_build_object('id','i'||g)) from generate_series(1,6) g)
  where id='00e10000-0000-0000-0000-0000000000a1' $$, 'a free booth may hold 6 items');
select throws_ok($$ update qkit.booths set menu_items = (select jsonb_agg(jsonb_build_object('id','i'||g)) from generate_series(1,7) g)
  where id='00e10000-0000-0000-0000-0000000000a1' $$, '42501', 'free plan menu item limit exceeded', 'a free booth cannot hold 7 items');
select lives_ok($$ update qkit.booths set menu_items = jsonb_build_array(jsonb_build_object('id','a','option_groups',
  (select jsonb_agg(jsonb_build_object('id','g'||g)) from generate_series(1,3) g)))
  where id='00e10000-0000-0000-0000-0000000000a1' $$, 'three option groups are allowed');
select throws_ok($$ update qkit.booths set menu_items = jsonb_build_array(jsonb_build_object('id','a','option_groups',
  (select jsonb_agg(jsonb_build_object('id','g'||g)) from generate_series(1,4) g)))
  where id='00e10000-0000-0000-0000-0000000000a1' $$, '42501', 'free plan option group limit exceeded', 'four option groups are rejected');
select lives_ok($$ update qkit.booths set menu_items = (select jsonb_agg(jsonb_build_object('id','i'||g)) from generate_series(1,40) g)
  where id='00e10000-0000-0000-0000-0000000000a2' $$, 'a qkit-tier booth has no item cap');

select * from finish();
rollback;
