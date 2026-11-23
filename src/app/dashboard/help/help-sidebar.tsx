"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown } from "lucide-react";
import type { HelpSearchEntry } from "@/content/help";
import { HelpSearch } from "./help-search-box";

export type SidebarCategory = {
  id: string;
  title: string;
  articles: { slug: string; title: string }[];
};

const HOME = "/dashboard/help";

function Nav({
  categories,
  pathname,
  label,
}: {
  categories: SidebarCategory[];
  pathname: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="space-y-5">
      {categories.map((category) => (
        <div key={category.id}>
          <p className="px-3 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            {category.title}
          </p>
          <ul className="mt-1 space-y-0.5">
            {category.articles.map((article) => {
              const href = `${HOME}/${article.slug}`;
              const current = pathname === href;
              return (
                <li key={article.slug}>
                  <Link
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors ${
                      current
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {article.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function HelpSidebar({
  categories,
  index,
}: {
  categories: SidebarCategory[];
  index: HelpSearchEntry[];
}) {
  const pathname = usePathname() ?? "";
  const onHome = pathname === HOME;

  return (
    <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
      <Link
        href={HOME}
        aria-current={onHome ? "page" : undefined}
        className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted"
      >
        <BookOpen aria-hidden className="size-4 text-primary" />
        Help home
      </Link>
      {!onHome && <HelpSearch index={index} hotkey />}
      <details className="group rounded-xl border border-border bg-card lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
          Browse topics
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="px-1 pb-3">
          <Nav
            categories={categories}
            pathname={pathname}
            label="Help topics"
          />
        </div>
      </details>
      <div className="hidden lg:block lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">
        <Nav
          categories={categories}
          pathname={pathname}
          label="Help topics sidebar"
        />
      </div>
    </aside>
  );
}
