import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import {
  HELP_CATEGORIES,
  articlesInCategory,
  buildSearchIndex,
  popularArticles,
} from "@/content/help";
import { HelpSearch } from "./help-search-box";

export const metadata: Metadata = {
  title: "User guide",
  robots: { index: false },
};

export default function HelpIndexPage() {
  const popular = popularArticles();
  const categories = HELP_CATEGORIES.map((category) => ({
    category,
    articles: articlesInCategory(category.id),
  })).filter(({ articles }) => articles.length > 0);

  return (
    <div className="space-y-10">
      <section className="space-y-4 rounded-2xl border border-border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="font-display text-3xl font-semibold leading-none sm:text-4xl">
          User guide
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Step-by-step answers for running your stall on qkit. Search, or pick a
          topic below. Press / to jump to search.
        </p>
        <div className="max-w-2xl pt-2">
          <HelpSearch index={buildSearchIndex()} size="large" hotkey />
        </div>
      </section>

      {popular.length > 0 && (
        <section aria-labelledby="help-popular" className="space-y-3">
          <h2 id="help-popular" className="font-display text-xl font-semibold">
            Popular articles
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {popular.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/dashboard/help/${article.slug}`}
                  className="group flex h-full min-h-11 items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
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
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="help-topics" className="space-y-3">
        <h2 id="help-topics" className="font-display text-xl font-semibold">
          Browse by topic
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map(({ category, articles }) => (
            <li key={category.id}>
              <Link
                href={`/dashboard/help/${articles[0].slug}`}
                className="group flex h-full flex-col gap-1 rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40"
              >
                <span className="font-display text-lg font-semibold">
                  {category.title}
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {category.description}
                </span>
                <span className="mt-auto flex items-center justify-between pt-3 font-mono text-xs uppercase tracking-[0.14em] text-primary">
                  {articles.length}{" "}
                  {articles.length === 1 ? "article" : "articles"}
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
