import { HELP_CATEGORIES } from "./categories";
import type { HelpArticle, HelpCategory, HelpCategoryId } from "./types";
import { article as gettingStarted } from "./getting-started/getting-started";
import { article as runningAService } from "./running-a-service/running-a-service";
import { article as menuAndStock } from "./menu-and-stock/menu-and-stock";
import { article as payments } from "./payments/payments";
import { article as printing } from "./printing/printing";
import { article as customerAlerts } from "./customer-alerts/customer-alerts";
import { article as plans } from "./plans/plans";
import { article as troubleshooting } from "./troubleshooting/troubleshooting";

export { HELP_CATEGORIES };
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
