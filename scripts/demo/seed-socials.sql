-- Gives the demo vendor's booth social links, for the come-back scene's
-- "Follow" footer. Run through psql by record.mjs against the loopback
-- database only; reset.sql wipes the account, so nothing outlives the session.

update qkit.booths
  set social_links = jsonb_build_object(
    'instagram', 'https://instagram.com/sunrisecoffeecart',
    'tiktok', 'https://tiktok.com/@sunrisecoffeecart',
    'website', 'https://sunrisecoffeecart.example.com'
  )
  where vendor_id = (select id from auth.users where email = 'demo-cart@qkit.local');
