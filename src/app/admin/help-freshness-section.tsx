import { ALL_HELP_ARTICLES } from "@/content/help";
import { HELP_STALE_AFTER_DAYS, staleHelpArticles } from "@/content/help/stale";
import type { HelpArticle } from "@/content/help";
import type { HelpFeedbackSummary } from "@/lib/help/feedback";

/**
 * Vendor help articles not re-checked against the code for over
 * `HELP_STALE_AFTER_DAYS` days, oldest first. Read from the in-repo registry,
 * so it needs no database. When `feedback` is given, a second block shows the
 * "Was this helpful?" counts per article and the latest "No" comments.
 */
export function HelpFreshnessSection({
  now,
  articles = ALL_HELP_ARTICLES,
  feedback = null,
}: {
  now: Date;
  articles?: readonly HelpArticle[];
  feedback?: HelpFeedbackSummary | null;
}) {
  const stale = staleHelpArticles(articles, now);

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Help articles to re-check
      </h2>
      {stale.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          All help articles were reviewed in the last {HELP_STALE_AFTER_DAYS}{" "}
          days.
        </p>
      ) : (
        <div className="space-y-2">
          {stale.map((a) => (
            <div
              key={a.slug}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{a.title}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {a.slug}
                </p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {a.ageDays} days old
              </p>
            </div>
          ))}
        </div>
      )}
      {feedback && (
        <HelpFeedbackBlock feedback={feedback} articles={articles} />
      )}
    </section>
  );
}

function HelpFeedbackBlock({
  feedback,
  articles,
}: {
  feedback: HelpFeedbackSummary;
  articles: readonly HelpArticle[];
}) {
  const titleBySlug = new Map(articles.map((a) => [a.slug, a.title]));
  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Was this helpful?
      </h3>
      {feedback.perArticle.length === 0 ? (
        <p className="text-sm text-muted-foreground">No votes yet.</p>
      ) : (
        <ul className="space-y-2">
          {feedback.perArticle.map((row) => (
            <li
              key={row.slug}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
            >
              <span className="min-w-0 truncate font-medium">
                {titleBySlug.get(row.slug) ?? row.slug}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {row.helpful} helpful, {row.notHelpful} not helpful
              </span>
            </li>
          ))}
        </ul>
      )}
      {feedback.recentComments.length > 0 && (
        <ul className="space-y-1 text-sm">
          {feedback.recentComments.map((c) => (
            <li key={`${c.slug}-${c.at}`} className="line-clamp-2">
              <span className="font-mono text-xs text-muted-foreground">
                {c.slug}
              </span>{" "}
              {c.comment}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
