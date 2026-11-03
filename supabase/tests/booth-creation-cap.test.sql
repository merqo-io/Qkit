begin;
select no_plan();

select ok(not has_function_privilege('authenticated', 'qkit.enforce_booth_creation_cap()', 'EXECUTE'),
  'cap trigger is not a caller RPC');
select ok(not has_function_privilege('service_role', 'qkit.enforce_booth_creation_cap()', 'EXECUTE'),
  'service role cannot invoke the internal trigger helper');

insert into auth.users(id,instance_id,aud,role,email) values
 ('00970000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-cap-free@test.local'),
 ('00970000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-cap-paid@test.local'),
 ('00970000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-cap-pass@test.local');
insert into qkit.vendors(id) values
 ('00970000-0000-0000-0000-000000000001'),
 ('00970000-0000-0000-0000-000000000002'),
 ('00970000-0000-0000-0000-000000000003');
insert into qkit.vendor_entitlements(vendor_id,tier,stats_window,issued_at,event_pass_starts_at,event_pass_ends_at) values
 ('00970000-0000-0000-0000-000000000002','qkit','90d',now(),null,null),
 ('00970000-0000-0000-0000-000000000003','free','24h',now(),now()-interval '1 day',now()+interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00970000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$ insert into qkit.booths(vendor_id,name) values
 ('00970000-0000-0000-0000-000000000001','first'),
 ('00970000-0000-0000-0000-000000000001','second') $$,
 '42501',null,'one multirow insert cannot bypass the free booth cap');
select is((select count(*) from qkit.booths),0::bigint,'the rejected batch leaves no partial booth');
select lives_ok($$ insert into qkit.booths(id,vendor_id,name) values
 ('00970000-0000-0000-0000-000000000010','00970000-0000-0000-0000-000000000001','free') $$,
 'a free vendor may create their first booth');
reset role;

set local role service_role;
select throws_ok($$ insert into qkit.booths(vendor_id,name) values
 ('00970000-0000-0000-0000-000000000001','service second') $$,
 '42501',null,'service provisioning respects the same free creation cap');
select lives_ok($$ insert into qkit.booths(id,vendor_id,name) values
 ('00970000-0000-0000-0000-000000000020','00970000-0000-0000-0000-000000000002','paid one'),
 ('00970000-0000-0000-0000-000000000021','00970000-0000-0000-0000-000000000002','paid two') $$,
 'permanent paid vendors may create multiple booths');
select lives_ok($$ insert into qkit.booths(vendor_id,name) values
 ('00970000-0000-0000-0000-000000000003','pass one'),
 ('00970000-0000-0000-0000-000000000003','pass two') $$,
 'a currently active pass permits multiple booths');
select throws_ok($$ update qkit.booths set
 id='00970000-0000-0000-0000-000000000022',
 vendor_id='00970000-0000-0000-0000-000000000001'
 where id='00970000-0000-0000-0000-000000000020' $$,
 '42501',null,'reassignment cannot evade the destination cap by changing row id');
update qkit.vendor_entitlements set tier='free', stats_window='24h' where vendor_id='00970000-0000-0000-0000-000000000002';
select lives_ok($$ update qkit.booths set name='still editable',is_active=false
 where vendor_id='00970000-0000-0000-0000-000000000002' $$,
 'a downgrade does not prevent editing or deactivating existing booths');
select lives_ok($$ delete from qkit.booths where id='00970000-0000-0000-0000-000000000010' $$,
 'deleting a free booth remains possible');
select lives_ok($$ insert into qkit.booths(vendor_id,name) values
 ('00970000-0000-0000-0000-000000000001','replacement') $$,
 'deletion restores capacity for a replacement');
reset role;

select * from finish();
rollback;
