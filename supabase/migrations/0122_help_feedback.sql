-- "Was this helpful?" votes on help articles. One row per vendor per article;
-- a vendor can change their vote, which updates the row. Vendors see and write
-- only their own rows, admins read all of them, nobody deletes (rows go with
-- the vendor via the FK cascade). The slug is checked for shape only: the app
-- validates it against the published article registry.

CREATE TABLE qkit.help_feedback (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID        NOT NULL DEFAULT auth.uid()
                           REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  article_slug TEXT        NOT NULL
                           CHECK (char_length(article_slug) BETWEEN 1 AND 100
                                  AND article_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  helpful      BOOLEAN     NOT NULL,
  comment      TEXT        CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, article_slug)
);

CREATE INDEX help_feedback_slug_idx ON qkit.help_feedback (article_slug);

CREATE TRIGGER help_feedback_updated_at
  BEFORE UPDATE ON qkit.help_feedback
  FOR EACH ROW EXECUTE FUNCTION qkit.update_updated_at();

ALTER TABLE qkit.help_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON qkit.help_feedback FROM anon, authenticated;
GRANT SELECT, INSERT ON qkit.help_feedback TO authenticated;
GRANT UPDATE (article_slug, helpful, comment) ON qkit.help_feedback TO authenticated;
GRANT ALL ON qkit.help_feedback TO service_role;

CREATE POLICY "help_feedback_select" ON qkit.help_feedback
  FOR SELECT TO authenticated
  USING (vendor_id = (SELECT auth.uid()) OR qkit.is_admin((SELECT auth.uid())));

CREATE POLICY "help_feedback_insert_own" ON qkit.help_feedback
  FOR INSERT TO authenticated
  WITH CHECK (vendor_id = auth.uid());

CREATE POLICY "help_feedback_update_own" ON qkit.help_feedback
  FOR UPDATE TO authenticated
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());
