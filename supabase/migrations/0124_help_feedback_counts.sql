-- Per-article helpful / not helpful vote counts for the admin help panel, so
-- the page reads one small aggregate instead of scanning every vote in Node.
-- SECURITY INVOKER on purpose: the help_feedback select policy still decides
-- which rows are counted, so an admin sees every vendor and a vendor only
-- their own votes.
CREATE OR REPLACE FUNCTION qkit.help_feedback_counts()
RETURNS TABLE (article_slug text, helpful bigint, not_helpful bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  SELECT
    f.article_slug,
    count(*) FILTER (WHERE f.helpful),
    count(*) FILTER (WHERE NOT f.helpful)
  FROM qkit.help_feedback f
  GROUP BY f.article_slug;
$$;

REVOKE EXECUTE ON FUNCTION qkit.help_feedback_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION qkit.help_feedback_counts() TO authenticated, service_role;

COMMENT ON FUNCTION qkit.help_feedback_counts() IS
  'Vote counts per help article over the rows the caller can read under help_feedback RLS (admins: all vendors).';
