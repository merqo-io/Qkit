-- Regression coverage for the October authorization review. Fixtures roll back.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values ('10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'review-vendor@test.local');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ insert into qkit.vendor_entitlements (vendor_id, tier, stats_window, issued_at)
     values ('10000000-0000-0000-0000-000000000001', 'qkit', '90d', now()) $$,
  '42501', null, 'a new vendor cannot self-grant a tier through INSERT');

select lives_ok(
  $$ insert into qkit.vendors (id)
     values ('10000000-0000-0000-0000-000000000001') $$,
  'normal onboarding can insert the vendor id');
select is(qkit.vendor_effective_tier('10000000-0000-0000-0000-000000000001'),
          'free', 'a vendor with no cached entitlement is on the free tier');

select throws_ok(
  $$ insert into qkit.booths (vendor_id, name, printkit_location_id)
     values ('10000000-0000-0000-0000-000000000001', 'Forged printer', 'foreign-location') $$,
  '42501', null, 'a vendor cannot forge the server-assigned printer id on INSERT');

select lives_ok(
  $$ insert into qkit.booths (id, vendor_id, name, short_code, payment, menu_items)
     values ('10000000-0000-0000-0000-000000000002',
             '10000000-0000-0000-0000-000000000001', 'Review booth',
             'reviewBooth1', '{"kind":"paynow"}',
             '[{"id":"coffee","name":"Coffee","available":true,"price_cents":500,
                "cost_cents":200,"stock":1,"option_groups":[
                  {"id":"milk","label":"Milk","choices":[
                    {"id":"oat","label":"Oat","price_delta_cents":100,"cost_delta_cents":40}
                  ]}]}]') $$,
  'normal booth creation remains authorized');
select lives_ok(
  $$ update qkit.booths set daily_cup_cap = 5
     where id = '10000000-0000-0000-0000-000000000002' $$,
  'the vendor can save the daily cup cap');
select is((select daily_cup_cap from qkit.booths
           where id = '10000000-0000-0000-0000-000000000002'),
          5, 'the daily cup cap update persisted');

select ok(not has_function_privilege('authenticated', 'qkit.assign_order_number(uuid)', 'EXECUTE'),
          'authenticated cannot execute the service-only number allocator');
select throws_ok(
  $$ select qkit.check_rate_limit('order:booth:someone-else', 1, 60) $$,
  '42501', null, 'authenticated cannot poison an arbitrary limiter bucket');
select throws_ok(
  $$ insert into qkit.events (type, metadata) values ('forged', '{"unbounded":true}') $$,
  '42501', null, 'authenticated cannot bypass event validation with a direct insert');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(not has_function_privilege('anon', 'qkit.assign_order_number(uuid)', 'EXECUTE'),
          'anon cannot inherit number allocator EXECUTE from PUBLIC');
select throws_ok(
  $$ select qkit.check_rate_limit('order:booth:someone-else', 1, 60) $$,
  '42501', null, 'anon cannot poison an arbitrary limiter bucket');
select throws_ok(
  $$ insert into qkit.events (type) values ('forged') $$,
  '42501', null, 'anon cannot bypass event validation with a direct insert');

select ok(not ((qkit.get_booth_for_order('reviewBooth1')->'menu_items'->0) ? 'cost_cents'),
          'the public menu omits base cost');
select ok(not ((qkit.get_booth_for_order('reviewBooth1')->'menu_items'->0
                ->'option_groups'->0->'choices'->0) ? 'cost_delta_cents'),
          'the public menu also omits nested option cost');
select is(qkit.get_booth_for_order('reviewBooth1')->'menu_items'->0
            ->'option_groups'->0->'choices'->0->>'price_delta_cents',
          '100', 'the public menu retains the customer-facing option price');

select lives_ok(
  $$ select qkit.place_order('reviewBooth1', 'Customer',
       '[{"menuItemId":"coffee","quantity":1,"options":[{"group":"Milk","choice":"Oat"}]}]',
       '10000000-0000-0000-0000-000000000003') $$,
  'a paid QR order can still reserve stock as anon');
select throws_like(
  $$ select qkit.place_order('reviewBooth1', 'Another customer',
       '[{"menuItemId":"coffee","quantity":1}]',
       '10000000-0000-0000-0000-000000000004') $$,
  '%ORDER_SOLD_OUT%', 'a later paid QR order cannot reuse reserved stock');
select throws_like(
  $$ select qkit.place_order('reviewBooth1', 'Malformed options',
       '[{"menuItemId":"coffee","quantity":1,"options":{"group":"Milk","choice":"Oat"}}]',
       gen_random_uuid()) $$,
  '%ORDER_INVALID: options must be an array%', 'QR rejects non-array options before storing the cart');
select throws_like(
  $$ select qkit.place_order('reviewBooth1', 'Duplicate choice',
       '[{"menuItemId":"coffee","quantity":1,"options":[{"group":"Milk","choice":"Oat"},{"group":"Milk","choice":"Oat"}]}]',
       gen_random_uuid()) $$,
  '%ORDER_INVALID: duplicate option%', 'QR rejects the same option twice');
select throws_like(
  $$ select qkit.place_order('reviewBooth1', 'Malformed selection',
       '[{"menuItemId":"coffee","quantity":1,"options":[{"group":{},"choice":"Oat"}]}]',
       gen_random_uuid()) $$,
  '%ORDER_INVALID: option shape%', 'QR rejects non-string group labels');
reset role;

select is((select order_number from qkit.orders
           where idempotency_key = '10000000-0000-0000-0000-000000000003'),
          null, 'reserving stock does not assign a paid order number early');
select set_config('test.review_order_id',
  (select id::text from qkit.orders
   where idempotency_key = '10000000-0000-0000-0000-000000000003'), true);

set local role anon;
select throws_ok(
  $$ select qkit.assign_order_number(current_setting('test.review_order_id')::uuid) $$,
  '42501', null, 'anon cannot number an existing order by UUID');
reset role;
set local role authenticated;
select throws_ok(
  $$ select qkit.assign_order_number(current_setting('test.review_order_id')::uuid) $$,
  '42501', null, 'authenticated cannot number an existing order by UUID');
reset role;
set local role service_role;
select is(qkit.check_rate_limit('review:service-only', 1, 60), true,
          'the service role can check the first limiter request');
select is(qkit.check_rate_limit('review:service-only', 1, 60), false,
          'the service role observes the exhausted limiter bucket');
select lives_ok(
  $$ select qkit.assign_order_number(current_setting('test.review_order_id')::uuid) $$,
  'the service role retains order-number assignment');
select lives_ok(
  $$ update qkit.platform_settings set banner_message = 'Review test' where id = 1 $$,
  'the service role can save the admin maintenance banner');
select lives_ok(
  $$ insert into qkit.events (type, metadata) values ('landing_cta', '{}') $$,
  'the service role can persist a validated server event');
reset role;

select set_config('test.review_order_number',
  (select order_number from qkit.orders where id = current_setting('test.review_order_id')::uuid), true);
select set_config('test.review_order_token',
  (select access_token::text from qkit.orders where id = current_setting('test.review_order_id')::uuid), true);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $$ select qkit.submit_feedback('customer', '10000000-0000-0000-0000-000000000002',
       current_setting('test.review_order_number'), 5, null, 'First review',
       current_setting('test.review_order_token')::uuid) $$,
  'first direct feedback submission is allowed');
select lives_ok(
  $$ select qkit.submit_feedback('customer', '10000000-0000-0000-0000-000000000002',
       current_setting('test.review_order_number'), 5, null, 'Second review',
       current_setting('test.review_order_token')::uuid) $$,
  'second direct feedback submission remains within the bound');
select lives_ok(
  $$ select qkit.submit_feedback('customer', '10000000-0000-0000-0000-000000000002',
       current_setting('test.review_order_number'), 5, null, 'Third review',
       current_setting('test.review_order_token')::uuid) $$,
  'third direct feedback submission remains within the bound');
select throws_like(
  $$ select qkit.submit_feedback('customer', '10000000-0000-0000-0000-000000000002',
       current_setting('test.review_order_number'), 5, null, 'Review flood',
       current_setting('test.review_order_token')::uuid) $$,
  '%FEEDBACK_RATE_LIMITED%', 'a fourth direct review cannot bypass the server-action limiter');
reset role;

-- A second menu exercises group cardinality and legitimate optional/multi-selects.
update qkit.booths set menu_items = menu_items ||
  '[{"id":"tea","name":"Tea","available":true,"option_groups":[
     {"id":"size","label":"Size","choices":[{"id":"s","label":"Small"},{"id":"l","label":"Large"}]},
     {"id":"extras","label":"Extras","multiple":true,"choices":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}]}]'
where id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_like(
  $$ select qkit.place_walkup_order('10000000-0000-0000-0000-000000000002', 'Malformed options',
       '[{"menuItemId":"tea","quantity":1,"options":false}]') $$,
  '%ORDER_INVALID: options must be an array%', 'walkup also rejects non-array options');
select throws_like(
  $$ select qkit.place_walkup_order('10000000-0000-0000-0000-000000000002', 'Two sizes',
       '[{"menuItemId":"tea","quantity":1,"options":[{"group":"Size","choice":"Small"},{"group":"Size","choice":"Large"}]}]') $$,
  '%ORDER_INVALID: single-choice group%', 'walkup rejects multiple selections in a single-choice group');
select throws_like(
  $$ select qkit.place_walkup_order('10000000-0000-0000-0000-000000000002', 'Duplicate extra',
       '[{"menuItemId":"tea","quantity":1,"options":[{"group":"Extras","choice":"A"},{"group":"Extras","choice":"A"}]}]') $$,
  '%ORDER_INVALID: duplicate option%', 'walkup rejects duplicate multi-select choices');
select lives_ok(
  $$ select qkit.place_walkup_order('10000000-0000-0000-0000-000000000002', 'Two extras',
       '[{"menuItemId":"tea","quantity":1,"options":[{"group":"Size","choice":"Small"},{"group":"Extras","choice":"A"},{"group":"Extras","choice":"B"}]}]') $$,
  'walkup preserves legitimate multi-select groups');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $$ select qkit.place_order('reviewBooth1', 'Optional options',
       '[{"menuItemId":"tea","quantity":1}]', gen_random_uuid()) $$,
  'omitted options preserve the existing optional schema contract');
select throws_like(
  $$ select qkit.place_order('reviewBooth1', 'Two sizes',
       '[{"menuItemId":"tea","quantity":1,"options":[{"group":"Size","choice":"Small"},{"group":"Size","choice":"Large"}]}]',
       gen_random_uuid()) $$,
  '%ORDER_INVALID: single-choice group%', 'QR rejects multiple selections in a single-choice group too');
reset role;

-- Standalone migration tests begin without merqo; completion must still work.
select lives_ok(
  $$ update qkit.orders set status = 'completed'
     where id = current_setting('test.review_order_id')::uuid $$,
  'completion succeeds without the shared merqo schema');
update qkit.orders set status = 'ready'
where id = current_setting('test.review_order_id')::uuid;
create schema if not exists merqo;
select lives_ok(
  $$ update qkit.orders set status = 'completed'
     where id = current_setting('test.review_order_id')::uuid $$,
  'completion succeeds when merqo exists without emit_metric');

-- A present integration is still invoked once and its failures remain visible.
create temporary table review_metric_calls (
  vendor_id uuid, kit_slug text, event_type text, metadata jsonb
);
create or replace function merqo.emit_metric(uuid, text, text, jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  insert into pg_temp.review_metric_calls values ($1, $2, $3, $4);
end;
$$;
update qkit.orders set status = 'ready'
where id = current_setting('test.review_order_id')::uuid;
select lives_ok(
  $$ update qkit.orders set status = 'completed'
     where id = current_setting('test.review_order_id')::uuid $$,
  'completion still calls a present metric integration');
select is((select count(*)::int from review_metric_calls
           where vendor_id = '10000000-0000-0000-0000-000000000001'
             and kit_slug = 'qkit' and event_type = 'order_completed'
             and metadata->>'order_id' = current_setting('test.review_order_id')),
          1, 'the integration receives the original vendor/event/order payload');
update qkit.orders set status = 'completed'
where id = current_setting('test.review_order_id')::uuid;
select is((select count(*)::int from review_metric_calls), 1,
          'resaving an already-completed order does not emit twice');
create or replace function merqo.emit_metric(uuid, text, text, jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception 'TEST_METRIC_FAILURE';
end;
$$;
update qkit.orders set status = 'ready'
where id = current_setting('test.review_order_id')::uuid;
select throws_like(
  $$ update qkit.orders set status = 'completed'
     where id = current_setting('test.review_order_id')::uuid $$,
  '%TEST_METRIC_FAILURE%', 'an installed metric integration failure is not swallowed');
select is((select status::text from qkit.orders
           where id = current_setting('test.review_order_id')::uuid),
          'ready', 'a real integration failure preserves transactional rollback');

select * from finish();
rollback;
