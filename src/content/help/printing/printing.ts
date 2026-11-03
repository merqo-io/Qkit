import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "printing",
  category: "printing",
  title: "Printing",
  summary:
    "Turn on per-item labels and see what the board shows when a label fails.",
  reviewed: "2026-11-03",
  uiLabels: [],
  covers: [
    "src/app/dashboard/booths/printing-section.tsx",
    "src/lib/printkit/client.ts",
    "src/lib/printkit/labels.ts",
  ],
  draft: true,
  body: [],
};
