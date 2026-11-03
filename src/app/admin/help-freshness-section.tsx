import { ALL_HELP_ARTICLES } from "@/content/help";
import { HELP_STALE_AFTER_DAYS, staleHelpArticles } from "@/content/help/stale";
import type { HelpArticle } from "@/content/help";

/**
 * Vendor help articles not re-checked against the code for over
 * `HELP_STALE_AFTER_DAYS` days, oldest first. Read from the in-repo registry,
 * so it needs no database.
 */
export function HelpFreshnessSection({
  now,
  articles = ALL_HELP_ARTICLES,
}: {
  now: Date;
  articles?: readonly HelpArticle[];
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
    </section>
  );
}
