import type { ReactNode } from "react";
import {
  HELP_CATEGORIES,
  articlesInCategory,
  buildSearchIndex,
} from "@/content/help";
import { HelpSidebar } from "./help-sidebar";

export default function HelpLayout({ children }: { children: ReactNode }) {
  const categories = HELP_CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    articles: articlesInCategory(category.id).map((a) => ({
      slug: a.slug,
      title: a.title,
    })),
  })).filter((category) => category.articles.length > 0);

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <HelpSidebar categories={categories} index={buildSearchIndex()} />
      <div className="mt-6 min-w-0 lg:mt-0">{children}</div>
    </div>
  );
}
