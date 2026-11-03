-- Demo dataset for PRODUCTION (hosted Supabase) — your own account.
--
-- Two booths under YOUR vendor account: "Kopitiam Cart" (PayNow payment) and
-- "Ice Cream Cart" (queue only). Sets your account to the qkit tier so both can
-- be active at once.
--
-- HOW TO RUN (Supabase SQL Editor):
--   1. Authentication → Users → your Google account → copy the User UID.
--   2. Replace the single __VENDOR_ID__ below with that UID.
--   3. Run.
--
-- Safe for prod: it does NOT touch auth.users (your account already exists),
-- refuses accounts with existing booths before changing any data. Use a dedicated
-- empty demo account. The /seed/*.svg banners ship with the app (public/), so they resolve
-- on the deployed site with no upload needed.

do $do$
declare vid uuid := '__VENDOR_ID__';
begin
  lock table qkit.booths in share row exclusive mode;
  if exists (select 1 from qkit.booths where vendor_id = vid) then
    raise exception 'Demo seed requires a vendor with no existing booths';
  end if;

  -- Your vendor row on the qkit tier (which lifts the 1-active-booth cap).
  -- Stall name lives in merqo.vendor_profile, not this row.
  insert into qkit.vendors (id)
  values (vid)
  on conflict (id) do nothing;

  insert into qkit.vendor_entitlements (vendor_id, tier, founder, stats_window, issued_at)
  values (vid, 'qkit', false, '90d', now())
  on conflict (vendor_id) do update set tier = 'qkit', stats_window = '90d';

  -- Booth 1: Kopitiam Cart — PayNow payment wired.
  insert into qkit.booths
    (id, vendor_id, name, is_active, image_url, payment, menu_items)
  values (
    'c0ffee01-0000-4000-8000-000000000001', vid, 'Kopitiam Cart', true,
    '/seed/kopitiam-cart.svg',
    '{"kind":"paynow","payee_name":"Kopitiam Cart","uen":"53312345A"}'::jsonb,
    '[
      {
        "id":"kopi","name":"Kopi","description":"Local coffee","price_cents":140,
        "image_url":"/seed/kopi.svg","available":true,
        "option_groups":[
          {"id":"style","label":"Style","choices":[
            {"id":"o","label":"O (black)"},
            {"id":"c","label":"C (evaporated milk)","allergens":["dairy"]},
            {"id":"normal","label":"Normal (condensed milk)","allergens":["dairy"]},
            {"id":"oat","label":"Oat Milk","price_delta_cents":100,"cost_delta_cents":40}
          ]},
          {"id":"temp","label":"Temperature","choices":[
            {"id":"hot","label":"Hot"},
            {"id":"iced","label":"Iced"}
          ]},
          {"id":"sugar","label":"Sugar","choices":[
            {"id":"normal","label":"Normal"},
            {"id":"less","label":"Less"},
            {"id":"none","label":"None"}
          ]}
        ]
      },
      {
        "id":"teh","name":"Teh","description":"Local tea","price_cents":140,
        "image_url":"/seed/teh.svg","available":true,
        "option_groups":[
          {"id":"style","label":"Style","choices":[
            {"id":"o","label":"O (no milk)"},
            {"id":"c","label":"C (evaporated milk)","allergens":["dairy"]},
            {"id":"normal","label":"Normal (condensed milk)","allergens":["dairy"]},
            {"id":"oat","label":"Oat Milk","price_delta_cents":100,"cost_delta_cents":40}
          ]},
          {"id":"temp","label":"Temperature","choices":[
            {"id":"hot","label":"Hot"},
            {"id":"iced","label":"Iced"}
          ]}
        ]
      },
      {
        "id":"milo","name":"Milo","description":"Malt chocolate","price_cents":200,
        "image_url":"/seed/milo.svg","available":true,"allergens":["dairy","soy"],
        "option_groups":[
          {"id":"temp","label":"Temperature","choices":[
            {"id":"hot","label":"Hot"},
            {"id":"iced","label":"Iced"}
          ]}
        ]
      }
    ]'::jsonb
  );

  -- Booth 2: Ice Cream Cart — queue only, NO payment.
  insert into qkit.booths
    (id, vendor_id, name, is_active, image_url, payment, menu_items)
  values (
    '1ce01ce0-0000-4000-8000-000000000002', vid, 'Ice Cream Cart', true,
    '/seed/ice-cream-cart.svg', null,
    '[
      {
        "id":"scoop","name":"Single Scoop","description":"One scoop in a cup or cone","price_cents":300,
        "available":true,
        "option_groups":[
          {"id":"flavour","label":"Flavour","choices":[
            {"id":"vanilla","label":"Vanilla"},
            {"id":"chocolate","label":"Chocolate"},
            {"id":"strawberry","label":"Strawberry"},
            {"id":"milo","label":"Milo","allergens":["dairy","soy"]}
          ]},
          {"id":"serving","label":"Serving","choices":[
            {"id":"cup","label":"Cup"},
            {"id":"cone","label":"Cone"}
          ]}
        ]
      },
      {
        "id":"double","name":"Double Scoop","description":"Two scoops, your pick","price_cents":500,
        "available":true,
        "option_groups":[
          {"id":"serving","label":"Serving","choices":[
            {"id":"cup","label":"Cup"},
            {"id":"cone","label":"Cone"}
          ]},
          {"id":"toppings","label":"Toppings","multiple":true,"choices":[
            {"id":"sprinkles","label":"Sprinkles"},
            {"id":"peanuts","label":"Peanuts","allergens":["nuts"]},
            {"id":"wafer","label":"Wafer","allergens":["gluten"]}
          ]}
        ]
      },
      {
        "id":"affogato","name":"Affogato","description":"Vanilla scoop drowned in espresso","price_cents":450,
        "available":true
      }
    ]'::jsonb
  );
end
$do$;
