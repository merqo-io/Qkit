-- help_feedback (0122): vendors see and write only their own votes, admins read
-- all, anon has no access.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hf-a@test.local'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hf-b@test.local'),
 ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hf-admin@test.local');
insert into qkit.vendors(id) values
 ('30000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002');
insert into qkit.admins(user_id) values ('30000000-0000-0000-0000-000000000003');
insert into qkit.help_feedback (vendor_id, article_slug, helpful, comment) values
 ('30000000-0000-0000-0000-000000000001', 'getting-started', false, 'missing step'),
 ('30000000-0000-0000-0000-000000000002', 'getting-started', true, null);

select ok(not has_table_privilege('anon', 'qkit.help_feedback', 'SELECT'), 'anon cannot select');
select ok(not has_table_privilege('anon', 'qkit.help_feedback', 'INSERT'), 'anon cannot insert');
select ok(not has_table_privilege('authenticated', 'qkit.help_feedback', 'DELETE'), 'vendors cannot delete');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((select count(*) from qkit.help_feedback), 1::bigint, 'a vendor reads only their own row');
select lives_ok($$ insert into qkit.help_feedback (article_slug, helpful) values ('payments', true) $$,
  'a vendor inserts their own vote, vendor_id defaulting to auth.uid()');
select throws_ok($$ insert into qkit.help_feedback (vendor_id, article_slug, helpful)
  values ('30000000-0000-0000-0000-000000000002', 'printing', true) $$,
  '42501', null, 'a vendor cannot insert a vote for another vendor');
select throws_ok($$ insert into qkit.help_feedback (article_slug, helpful) values ('Bad Slug', true) $$,
  '23514', null, 'a malformed slug is rejected');
select throws_ok($$ insert into qkit.help_feedback (article_slug, helpful, comment)
  values ('printing', false, repeat('x', 501)) $$,
  '23514', null, 'a comment over 500 characters is rejected');
select lives_ok($$ update qkit.help_feedback set helpful = true where article_slug = 'getting-started' $$,
  'a vendor can change their own vote');
select is((select count(*) from qkit.help_feedback where vendor_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint, 'another vendor row stays invisible');

reset role;
select is((select helpful from qkit.help_feedback
  where vendor_id = '30000000-0000-0000-0000-000000000002' and article_slug = 'getting-started'),
  true, 'seeded row of vendor B is intact');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
update qkit.help_feedback set helpful = false where vendor_id = '30000000-0000-0000-0000-000000000001';
reset role;
select is((select helpful from qkit.help_feedback
  where vendor_id = '30000000-0000-0000-0000-000000000001' and article_slug = 'getting-started'),
  true, 'a vendor cannot update another vendor row');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((select count(*) from qkit.help_feedback), 3::bigint, 'an admin reads every row');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$ insert into qkit.help_feedback (vendor_id, article_slug, helpful)
  values ('30000000-0000-0000-0000-000000000001', 'printing', true) $$,
  '42501', null, 'anon cannot insert');
reset role;

insert into qkit.help_feedback (vendor_id, article_slug, helpful)
  values ('30000000-0000-0000-0000-000000000002', 'payments', false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select results_eq(
  $$ select article_slug, helpful, not_helpful from qkit.help_feedback_counts() order by article_slug $$,
  $$ values ('getting-started'::text, 2::bigint, 0::bigint), ('payments'::text, 1::bigint, 1::bigint) $$,
  'help_feedback_counts: an admin sees counts across all vendors');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select results_eq(
  $$ select article_slug, helpful, not_helpful from qkit.help_feedback_counts() order by article_slug $$,
  $$ values ('getting-started'::text, 1::bigint, 0::bigint), ('payments'::text, 0::bigint, 1::bigint) $$,
  'help_feedback_counts: a vendor counts only their own votes');
reset role;

select ok(not has_function_privilege('anon', 'qkit.help_feedback_counts()', 'EXECUTE'), 'anon cannot execute help_feedback_counts');
select ok(has_function_privilege('authenticated', 'qkit.help_feedback_counts()', 'EXECUTE'), 'authenticated can execute help_feedback_counts');

select * from finish();
rollback;
