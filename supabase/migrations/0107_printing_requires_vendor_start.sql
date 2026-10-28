-- Printing must not automatically start a non-payment order.
CREATE OR REPLACE FUNCTION qkit.require_vendor_start_for_printing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payment_status = 'not_required'
     AND NEW.status = 'preparing'
     AND EXISTS (
       SELECT 1 FROM qkit.booths b
       WHERE b.id = NEW.booth_id AND b.print_enabled
     ) THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION qkit.require_vendor_start_for_printing()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_require_vendor_start_for_printing
  BEFORE INSERT ON qkit.orders
  FOR EACH ROW EXECUTE FUNCTION qkit.require_vendor_start_for_printing();
