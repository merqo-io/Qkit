import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "running-a-service",
  category: "running-a-service",
  title: "Running a service",
  summary:
    "Work the live board, log walk-up orders, restart the count and show the TV screen.",
  reviewed: "2026-11-03",
  uiLabels: [],
  covers: [
    "src/app/dashboard/realtime-order-board.tsx",
    "src/app/dashboard/walkup-order-dialog.tsx",
    "src/app/dashboard/board-batch.tsx",
    "src/app/dashboard/start-service-button.tsx",
    "src/app/dashboard/customer-screen-dialog.tsx",
  ],
  draft: true,
  body: [],
};
