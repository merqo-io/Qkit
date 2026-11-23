-- Booth-level reusable modifier groups. booths.modifier_groups is a JSONB array
-- of OptionGroup-shaped entries (a library). An inline group in
-- booths.menu_items[].option_groups[] that links to one carries
-- "shared_id" = the library entry id and is a full copy of it, so the order
-- path (place_order, place_walkup_order, validate_order_options) keeps reading
-- inline groups by label and is untouched. The app re-expands every linked
-- copy from the library on save.
--
-- Backfill: per booth, groups that are identical across 2+ items (same label,
-- multiple flag, and choices in order by label, price/cost delta, allergens
-- and code; ids ignored) become one library entry and each matching inline
-- copy gets shared_id. When two different groups share a label (compared
-- trimmed and case-insensitive) only the most-used one is promoted. Inline
-- labels, choices and ids are never changed. Booths whose modifier_groups is
-- already non-empty are skipped, so a rerun is a no-op. The count caps
-- trigger is disabled for the rewrite because item and group counts do not
-- change and a legacy over-cap booth must not abort the migration.
--
-- Rollback:
--   UPDATE qkit.booths SET menu_items = COALESCE((
--     SELECT jsonb_agg(
--       CASE WHEN jsonb_typeof(mi->'option_groups') = 'array'
--         THEN jsonb_set(mi, '{option_groups}', COALESCE((
--           SELECT jsonb_agg(og - 'shared_id' ORDER BY g.ord)
--           FROM jsonb_array_elements(mi->'option_groups') WITH ORDINALITY AS g(og, ord)
--         ), '[]'::jsonb))
--         ELSE mi END ORDER BY m.ord)
--     FROM jsonb_array_elements(menu_items) WITH ORDINALITY AS m(mi, ord)
--   ), '[]'::jsonb) WHERE jsonb_typeof(menu_items) = 'array';
--   DROP FUNCTION qkit.backfill_modifier_groups();
--   REVOKE UPDATE (modifier_groups, menu_revision) ON qkit.booths FROM authenticated;
--   ALTER TABLE qkit.booths DROP COLUMN modifier_groups, DROP COLUMN menu_revision;
-- menu_revision is bumped by every menu_items / modifier_groups write so two
-- concurrent saves cannot silently overwrite each other (compare-and-set).
ALTER TABLE qkit.booths
  ADD COLUMN modifier_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN menu_revision bigint NOT NULL DEFAULT 0;

-- 0091 limits UPDATE on booths to a column allowlist; new columns do not
-- inherit it. Nothing is granted to anon.
GRANT UPDATE (modifier_groups, menu_revision) ON qkit.booths TO authenticated;

-- Kept as a function (not a one-off DO block) so the pgTAP file can rerun the
-- backfill on fixtures; nobody but the owner can execute it.
CREATE FUNCTION qkit.backfill_modifier_groups()
RETURNS void
LANGUAGE plpgsql
SET search_path = qkit, pg_catalog
AS $$
DECLARE
  b RECORD;
  v_library jsonb;
  v_items jsonb;
BEGIN
  ALTER TABLE qkit.booths DISABLE TRIGGER booths_enforce_menu_caps;
  FOR b IN
    SELECT id, menu_items FROM qkit.booths
    WHERE modifier_groups = '[]'::jsonb
      AND jsonb_typeof(menu_items) = 'array'
  LOOP
    CREATE TEMP TABLE _mg ON COMMIT DROP AS
    SELECT m.ord AS item_ord, g.ord AS group_ord, g.og AS og,
      jsonb_build_object(
        'label', g.og->>'label',
        'multiple', COALESCE(g.og->'multiple', 'false'::jsonb),
        'choices', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'label', c.ch->>'label',
            'price', COALESCE(c.ch->'price_delta_cents', '0'::jsonb),
            'cost', COALESCE(c.ch->'cost_delta_cents', '0'::jsonb),
            'allergens', COALESCE(c.ch->'allergens', '[]'::jsonb),
            'code', COALESCE(c.ch->'code', '""'::jsonb)
          ) ORDER BY c.cord)
          FROM jsonb_array_elements(g.og->'choices') WITH ORDINALITY AS c(ch, cord)
        ), '[]'::jsonb)
      ) AS fp
    FROM jsonb_array_elements(b.menu_items) WITH ORDINALITY AS m(mi, ord)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(m.mi->'option_groups') = 'array'
        THEN m.mi->'option_groups' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS g(og, ord)
    WHERE jsonb_typeof(g.og->'choices') = 'array'
      AND jsonb_typeof(g.og->'label') = 'string';

    CREATE TEMP TABLE _mg_pick ON COMMIT DROP AS
    WITH usage AS (
      SELECT fp, lower(btrim(fp->>'label')) AS lbl,
        count(DISTINCT item_ord) AS n, min(item_ord * 1000 + group_ord) AS first_pos
      FROM _mg GROUP BY fp
      HAVING count(DISTINCT item_ord) >= 2
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY lbl ORDER BY n DESC, first_pos) AS rk
      FROM usage
    )
    SELECT fp, gen_random_uuid()::text AS lib_id, first_pos FROM ranked WHERE rk = 1;

    SELECT COALESCE(jsonb_agg(
      jsonb_set(
        (SELECT og FROM _mg WHERE _mg.fp = p.fp ORDER BY item_ord, group_ord LIMIT 1),
        '{id}', to_jsonb(p.lib_id)
      ) ORDER BY p.first_pos
    ), '[]'::jsonb) INTO v_library FROM _mg_pick p;

    IF v_library <> '[]'::jsonb THEN
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(m.mi->'option_groups') = 'array' THEN
          jsonb_set(m.mi, '{option_groups}', COALESCE((
            SELECT jsonb_agg(
              COALESCE((
                SELECT g.og || jsonb_build_object('shared_id', p.lib_id)
                FROM _mg x JOIN _mg_pick p ON p.fp = x.fp
                WHERE x.item_ord = m.ord AND x.group_ord = g.ord
              ), g.og) ORDER BY g.ord)
            FROM jsonb_array_elements(m.mi->'option_groups') WITH ORDINALITY AS g(og, ord)
          ), '[]'::jsonb))
        ELSE m.mi END ORDER BY m.ord)
      INTO v_items
      FROM jsonb_array_elements(b.menu_items) WITH ORDINALITY AS m(mi, ord);

      UPDATE qkit.booths
      SET modifier_groups = v_library, menu_items = v_items
      WHERE id = b.id;
    END IF;

    DROP TABLE _mg_pick;
    DROP TABLE _mg;
  END LOOP;
  ALTER TABLE qkit.booths ENABLE TRIGGER booths_enforce_menu_caps;
END;
$$;

REVOKE ALL ON FUNCTION qkit.backfill_modifier_groups()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT qkit.backfill_modifier_groups();
