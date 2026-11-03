begin isolation level repeatable read;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email) values
 ('0097eeee-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-repeatable-free@test.local'),
 ('0097eeee-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','booth-repeatable-paid@test.local');
insert into qkit.vendors(id) values
 ('0097eeee-0000-0000-0000-000000000001'),
 ('0097eeee-0000-0000-0000-000000000002');
insert into qkit.vendor_entitlements(vendor_id,tier,stats_window,issued_at) values
 ('0097eeee-0000-0000-0000-000000000002','qkit','90d',now());
select throws_ok($$ insert into qkit.booths(vendor_id,name) values
 ('0097eeee-0000-0000-0000-000000000001','repeatable free') $$,
 '22023','free booth creation requires READ COMMITTED isolation',
 'fixed-snapshot isolation cannot bypass the free recount');
select lives_ok($$ insert into qkit.booths(vendor_id,name) values
 ('0097eeee-0000-0000-0000-000000000002','paid one'),
 ('0097eeee-0000-0000-0000-000000000002','paid two') $$,
 'paid creation remains available at stronger isolation');
update qkit.vendor_entitlements set tier='free', stats_window='24h' where vendor_id='0097eeee-0000-0000-0000-000000000002';
select lives_ok($$ update qkit.booths set name='downgraded edit'
 where vendor_id='0097eeee-0000-0000-0000-000000000002' $$,
 'mere editing after downgrade does not invoke the isolation restriction');

select * from finish();
rollback;
