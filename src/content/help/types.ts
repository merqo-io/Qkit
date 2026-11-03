export const HELP_CATEGORY_IDS = [
  "getting-started",
  "running-a-service",
  "menu-and-stock",
  "payments",
  "printing",
  "customer-alerts",
  "plans",
  "troubleshooting",
] as const;

export type HelpCategoryId = (typeof HELP_CATEGORY_IDS)[number];

export type HelpBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "bullets"; items: string[] }
  | { type: "note"; text: string }
  | { type: "tip"; text: string }
  | { type: "link"; text: string; href: string };

export type HelpArticle = {
  slug: string;
  category: HelpCategoryId;
  title: string;
  summary: string;
  /** ISO date (YYYY-MM-DD) the article was last checked against the code. */
  reviewed: string;
  /** Exact UI strings the body quotes; the drift test finds each in src/. */
  uiLabels: string[];
  /** Repo-relative source paths the article describes; the drift test checks they exist. */
  covers: string[];
  /** Hidden from the help index and a 404 on its own page until written. */
  draft?: boolean;
  body: HelpBlock[];
};

export type HelpCategory = {
  id: HelpCategoryId;
  title: string;
  description: string;
};
