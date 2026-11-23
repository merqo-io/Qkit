-- 0123: booths.modifier_groups library, shared_id links and the backfill.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email) values
 ('51000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mg-a@test.local'),
 ('51000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mg-b@test.local');
insert into qkit.vendors(id) values
 ('51000000-0000-0000-0000-000000000001'),
 ('51000000-0000-0000-0000-000000000002');

insert into qkit.booths (id, vendor_id, name, is_active, short_code, menu_items) values
 ('51000000-0000-0000-0000-0000000000b1','51000000-0000-0000-0000-000000000001','Shared A',true,'mgcode1',
  '[{"id":"m1","name":"Kopi","price_cents":300,"available":true,"option_groups":[
      {"id":"g1","label":"Sugar","choices":[{"id":"c1","label":"Normal"},{"id":"c2","label":"Less","price_delta_cents":50}]},
      {"id":"g2","label":"Solo","choices":[{"id":"c3","label":"Only"}]}]},
    {"id":"m2","name":"Teh","price_cents":300,"available":true,"option_groups":[
      {"id":"g9","label":"Sugar","choices":[{"id":"c9","label":"Normal"},{"id":"c10","label":"Less","price_delta_cents":50}]}]},
    {"id":"m3","name":"Milo","price_cents":300,"available":true,"option_groups":[
      {"id":"g5","label":"Sugar","choices":[{"id":"c5","label":"Normal"},{"id":"c6","label":"Less","price_delta_cents":99}]}]}]'),
 ('51000000-0000-0000-0000-0000000000b2','51000000-0000-0000-0000-000000000002','Shared B',true,'mgcode2',
  '[{"id":"m1","name":"Tea","price_cents":100,"available":true}]');

select qkit.backfill_modifier_groups();

select is(jsonb_array_length(modifier_groups), 1, 'one library entry promoted')
  from qkit.booths where id = '51000000-0000-0000-0000-0000000000b1';
select is((modifier_groups->0->>'label'), 'Sugar', 'the library entry is the identical group')
  from qkit.booths where id = '51000000-0000-0000-0000-0000000000b1';
select is(
  (select count(*)::int from qkit.booths b,
     jsonb_array_elements(b.menu_items) mi, jsonb_array_elements(mi->'option_groups') og
   where b.id = '51000000-0000-0000-0000-0000000000b1'
     and og->>'shared_id' = b.modifier_groups->0->>'id'),
  2, 'both identical inline copies are linked');
select is(
  (select count(*)::int from qkit.booths b,
     jsonb_array_elements(b.menu_items) mi, jsonb_array_elements(mi->'option_groups') og
   where b.id = '51000000-0000-0000-0000-0000000000b1' and og ? 'shared_id'),
  2, 'single-item and differing groups stay unlinked');

select is(
  (select menu_items #- '{0,option_groups,0,shared_id}' #- '{1,option_groups,0,shared_id}'
   from qkit.booths where id = '51000000-0000-0000-0000-0000000000b1'),
  '[{"id":"m1","name":"Kopi","price_cents":300,"available":true,"option_groups":[
      {"id":"g1","label":"Sugar","choices":[{"id":"c1","label":"Normal"},{"id":"c2","label":"Less","price_delta_cents":50}]},
      {"id":"g2","label":"Solo","choices":[{"id":"c3","label":"Only"}]}]},
    {"id":"m2","name":"Teh","price_cents":300,"available":true,"option_groups":[
      {"id":"g9","label":"Sugar","choices":[{"id":"c9","label":"Normal"},{"id":"c10","label":"Less","price_delta_cents":50}]}]},
    {"id":"m3","name":"Milo","price_cents":300,"available":true,"option_groups":[
      {"id":"g5","label":"Sugar","choices":[{"id":"c5","label":"Normal"},{"id":"c6","label":"Less","price_delta_cents":99}]}]}]'::jsonb,
  'inline labels, choices and ids are unchanged');

create temp table _before as
  select modifier_groups mg, menu_items mi from qkit.booths
  where id = '51000000-0000-0000-0000-0000000000b1';
select qkit.backfill_modifier_groups();
select ok(
  (select b.modifier_groups = t.mg and b.menu_items = t.mi
   from qkit.booths b, _before t where b.id = '51000000-0000-0000-0000-0000000000b1'),
  'a rerun changes nothing');
select is((select modifier_groups from qkit.booths where id = '51000000-0000-0000-0000-0000000000b2'),
  '[]'::jsonb, 'a booth with no repeated groups keeps an empty library');

select lives_ok(
  $$ select qkit.place_order('mgcode1', 'Ada',
       '[{"menuItemId":"m2","quantity":1,"options":[{"group":"Sugar","choice":"Less"}]}]'::jsonb,
       '51000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'place_order accepts a linked group choice');
select is(
  (select total_cents from qkit.orders where booth_id = '51000000-0000-0000-0000-0000000000b1'),
  350, 'place_order prices the linked group choice');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','51000000-0000-0000-0000-000000000002','role','authenticated')::text, true);
select is((select count(*)::int from qkit.booths where id = '51000000-0000-0000-0000-0000000000b1'),
  0, 'vendor B cannot read vendor A modifier_groups');
update qkit.booths set modifier_groups = '[]'::jsonb where id = '51000000-0000-0000-0000-0000000000b1';
reset role;
select is(jsonb_array_length(modifier_groups), 1, 'vendor B cannot update vendor A modifier_groups')
  from qkit.booths where id = '51000000-0000-0000-0000-0000000000b1';

select * from finish();
rollback;
