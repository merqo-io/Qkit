import { HELP_CATEGORIES, POPULAR_HELP_SLUGS } from "./categories";
import type {
  HelpArticle,
  HelpBlock,
  HelpCategory,
  HelpCategoryId,
} from "./types";
import { article as gettingStarted } from "./getting-started/getting-started";
import { article as runningAService } from "./running-a-service/running-a-service";
import { article as menuAndStock } from "./menu-and-stock/menu-and-stock";
import { article as payments } from "./payments/payments";
import { article as printing } from "./printing/printing";
import { article as customerAlerts } from "./customer-alerts/customer-alerts";
import { article as plans } from "./plans/plans";
import { article as troubleshooting } from "./troubleshooting/troubleshooting";

export { HELP_CATEGORIES, POPULAR_HELP_SLUGS };
export type { HelpArticle, HelpBlock, HelpCategory } from "./types";

export const ALL_HELP_ARTICLES: readonly HelpArticle[] = [
  gettingStarted,
  runningAService,
  menuAndStock,
  payments,
  printing,
  customerAlerts,
  plans,
  troubleshooting,
];

export function publishedArticles(): HelpArticle[] {
  return ALL_HELP_ARTICLES.filter((a) => !a.draft);
}

export function articlesInCategory(id: HelpCategoryId): HelpArticle[] {
  return publishedArticles().filter((a) => a.category === id);
}

/** A draft returns undefined, so its page 404s like an unknown slug. */
export function getPublishedArticle(slug: string): HelpArticle | undefined {
  return publishedArticles().find((a) => a.slug === slug);
}

export function categoryFor(article: HelpArticle): HelpCategory {
  const found = HELP_CATEGORIES.find((c) => c.id === article.category);
  if (!found) throw new Error(`Unknown help category: ${article.category}`);
  return found;
}

/** Every published article in sidebar order: categories in order, then articles within each. */
export function orderedArticles(): HelpArticle[] {
  return HELP_CATEGORIES.flatMap((c) => articlesInCategory(c.id));
}

export function popularArticles(): HelpArticle[] {
  const published = publishedArticles();
  return POPULAR_HELP_SLUGS.flatMap((slug) => {
    const found = published.find((a) => a.slug === slug);
    return found ? [found] : [];
  });
}

export function flattenBlock(block: HelpBlock): string {
  switch (block.type) {
    case "steps":
    case "bullets":
      return block.items.join(" ");
    default:
      return block.text;
  }
}

export type HelpSearchEntry = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  text: string;
};

/** Plain data only, so it can cross into a client component as props. */
export function buildSearchIndex(): HelpSearchEntry[] {
  return orderedArticles().map((article) => ({
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: categoryFor(article).title,
    text: article.body.map(flattenBlock).join(" "),
  }));
}
