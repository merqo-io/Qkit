-- Landing showcase (0123): anon reads only toggled vendors' name and https
-- logo, and vendors cannot flip their own showcase_on_landing flag.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sc-a@test.local','{"display_name":"  Zed Stall ","avatar_url":"https://img.test/a.png"}'),
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sc-b@test.local','{"avatar_url":"http://img.test/b.png"}'),
 ('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sc-c@test.local','{"display_name":"Hidden","avatar_url":"https://img.test/c.png"}'),
 ('40000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sc-d@test.local','{}');
insert into qkit.vendors(id, showcase_on_landing) values
 ('40000000-0000-0000-0000-000000000001', true),
 ('40000000-0000-0000-0000-000000000002', true),
 ('40000000-0000-0000-0000-000000000003', false),
 ('40000000-0000-0000-0000-000000000004', true);
insert into qkit.vendor_entitlements(vendor_id,tier,stats_window,issued_at) values
 ('40000000-0000-0000-0000-000000000002','qkit','90d',now());
insert into qkit.booths (id, vendor_id, name, created_at) values
 ('40000000-0000-0000-0000-0000000b0002','40000000-0000-0000-0000-000000000002','Booth Bee','2026-02-01'),
 ('40000000-0000-0000-0000-0000000b0003','40000000-0000-0000-0000-000000000002','Later Booth','2026-03-01');

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select is((select count(*)::int from qkit.get_showcase_vendors()), 2,
  'anon sees only toggled vendors that have a name');
select is((select name from qkit.get_showcase_vendors() limit 1), 'Booth Bee',
  'a vendor without a display name falls back to its oldest booth, ordered by name');
select is((select logo_url from qkit.get_showcase_vendors() where name = 'Zed Stall'),
  'https://img.test/a.png', 'display name is trimmed and the https logo is returned');
select is((select logo_url from qkit.get_showcase_vendors() where name = 'Booth Bee'), null,
  'a non-https avatar returns a null logo');
select is((select count(*)::int from qkit.get_showcase_vendors() where name = 'Hidden'), 0,
  'an untoggled vendor is not listed');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $$ update qkit.vendors set showcase_on_landing = false where id = '40000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a vendor cannot change its own showcase_on_landing');
select lives_ok(
  $$ update qkit.vendors set tours_seen = '{}'::jsonb where id = '40000000-0000-0000-0000-000000000001' $$,
  'a vendor can still update allowed columns');

reset role;
set local role service_role;
select lives_ok(
  $$ update qkit.vendors set showcase_on_landing = true where id = '40000000-0000-0000-0000-000000000003' $$,
  'the service role (admin portal) can set showcase_on_landing');

select * from finish();
rollback;
