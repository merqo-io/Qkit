import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "customer-alerts",
  category: "customer-alerts",
  title: "Customer alerts",
  summary: "What customers see at each stage and how ready alerts reach them.",
  reviewed: "2026-11-03",
  uiLabels: [],
  covers: [
    "src/lib/order-alerts.ts",
    "src/lib/push/send.ts",
    "src/lib/merqo/customer-notify.ts",
    "src/app/dashboard/settings/settings-form.tsx",
  ],
  draft: true,
  body: [],
};
