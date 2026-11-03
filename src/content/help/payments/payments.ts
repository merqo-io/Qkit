import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "payments",
  category: "payments",
  title: "Payments",
  summary:
    "Handle payment claims, confirm that you were paid and settle walk-up orders.",
  reviewed: "2026-11-03",
  uiLabels: [],
  covers: [
    "src/components/board/order-card-parts.tsx",
    "src/app/dashboard/order-actions.ts",
    "src/lib/paykit/client.ts",
  ],
  draft: true,
  body: [],
};
