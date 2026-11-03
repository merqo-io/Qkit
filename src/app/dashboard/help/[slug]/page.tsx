import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  categoryFor,
  getPublishedArticle,
  publishedArticles,
} from "@/content/help";
import { ArticleBody } from "../article-body";

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

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/dashboard/help"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        User guide
      </Link>

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

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Last checked {article.reviewed}
      </p>
    </article>
  );
}
