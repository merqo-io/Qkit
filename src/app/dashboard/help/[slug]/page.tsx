import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  categoryFor,
  getPublishedArticle,
  orderedArticles,
  publishedArticles,
} from "@/content/help";
import { createServerClient } from "@/lib/supabase/server";
import { loadMyHelpVote } from "@/lib/help/feedback-queries";
import { ArticleBody, articleHeadings } from "../article-body";
import { ArticleFeedback } from "../article-feedback";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return publishedArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getPublishedArticle(slug);
  return {
    title: article ? `${article.title} | User guide` : "User guide",
    robots: { index: false },
  };
}

export default async function HelpArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = getPublishedArticle(slug);
  if (!article) notFound();
  const category = categoryFor(article);
  const headings = articleHeadings(article.body);
  const myVote = await loadMyHelpVote(await createServerClient(), article.slug);
  const sequence = orderedArticles();
  const position = sequence.findIndex((a) => a.slug === article.slug);
  const previous = position > 0 ? sequence[position - 1] : undefined;
  const next =
    position < sequence.length - 1 ? sequence[position + 1] : undefined;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-10">
      <article className="min-w-0 max-w-3xl space-y-6">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <li>
              <Link
                href="/dashboard/help"
                className="font-medium hover:text-foreground"
              >
                Help
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li>{category.title}</li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="text-foreground">
              {article.title}
            </li>
          </ol>
        </nav>

        <header className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {category.title}
          </p>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {article.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {article.summary}
          </p>
        </header>

        <ArticleBody blocks={article.body} />

        {myVote.available && (
          <ArticleFeedback
            key={article.slug}
            slug={article.slug}
            initialVote={myVote.vote}
          />
        )}

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          Last checked {article.reviewed}
        </p>

        <nav
          aria-label="Previous and next articles"
          className="grid gap-3 sm:grid-cols-2"
        >
          {previous ? (
            <Link
              href={`/dashboard/help/${previous.slug}`}
              rel="prev"
              className="flex min-h-11 flex-col rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronLeft aria-hidden className="size-3.5" />
                Previous
              </span>
              <span className="font-semibold">{previous.title}</span>
            </Link>
          ) : (
            <span aria-hidden className="hidden sm:block" />
          )}
          {next && (
            <Link
              href={`/dashboard/help/${next.slug}`}
              rel="next"
              className="flex min-h-11 flex-col items-end rounded-xl border border-border bg-card px-4 py-3 text-right transition-colors hover:border-primary/40"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Next
                <ChevronRight aria-hidden className="size-3.5" />
              </span>
              <span className="font-semibold">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>

      {headings.length > 0 && (
        <nav
          aria-label="On this page"
          className="hidden xl:block xl:sticky xl:top-6 xl:self-start"
        >
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            On this page
          </p>
          <ul className="mt-2 space-y-1 border-l border-border">
            {headings.map((heading) => (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  className="-ml-px block border-l border-transparent py-1 pl-3 text-sm leading-snug text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
