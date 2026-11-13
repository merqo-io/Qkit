import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@merqo/ui";
import { HELP_CATEGORIES, articlesInCategory } from "@/content/help";

export const metadata: Metadata = {
  title: "User guide",
  robots: { index: false },
};

export default function HelpIndexPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold leading-none sm:text-4xl">
          User guide
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Step-by-step answers for running your stall on qkit.
        </p>
      </div>

      <div className="space-y-7">
        {HELP_CATEGORIES.map((category) => {
          const articles = articlesInCategory(category.id);
          return (
            <section
              key={category.id}
              aria-labelledby={`help-${category.id}`}
              className="space-y-2"
            >
              <div>
                <h2
                  id={`help-${category.id}`}
                  className="font-display text-xl font-semibold"
                >
                  {category.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {category.description}
                </p>
              </div>
              {articles.length === 0 ? (
                <EmptyState size="compact" title="Coming soon." />
              ) : (
                <ul className="space-y-2">
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/dashboard/help/${article.slug}`}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground">
                            {article.title}
                          </span>
                          <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                            {article.summary}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
