import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "plans",
  category: "plans",
  title: "Plans",
  summary:
    "What Free, Starter and qkit include and what Over plan limit means.",
  reviewed: "2026-11-04",
  uiLabels: ["Event pass", "Over plan limit", "New booth"],
  covers: [
    "src/lib/plan.ts",
    "src/lib/booth/access.ts",
    "src/app/dashboard/plan/page.tsx",
    "src/app/dashboard/booths/page.tsx",
    "src/app/dashboard/booths/booth-list.tsx",
    "src/app/dashboard/booths/working-hours-editor.tsx",
    "src/app/dashboard/booths/menu-editor.tsx",
    "src/app/dashboard/booths/option-groups-editor.tsx",
    "src/app/dashboard/stats/page.tsx",
  ],
  body: [
    {
      type: "paragraph",
      text: "qkit has three plans: Free, Starter and qkit, plus an optional Event Pass for a set of dates. Your current plan is shown at the top of the Plan page. This guide lists what each one allows, and what happens to your booths when your plan changes.",
    },

    { type: "heading", level: 2, text: "What each plan includes" },
    {
      type: "bullets",
      items: [
        "Free: the live order board and QR posters, one booth, up to 6 menu items, up to 3 option groups on an item, and the last 24 hours of stats.",
        "Starter: one booth with unlimited items and customization, scheduled auto-close hours, sold-out stock caps and the daily item limit. Stats stay at the last 24 hours.",
        "qkit: everything in Starter, plus extra booths, the customer queue display on the TV, order labels, order-ready push alerts and full history and trends (7, 30 and 90 days) on the Stats page.",
        "Event Pass: a window of dates that gives you the qkit plan's features while it runs, with stats from the day it starts. The Plan page shows the countdown.",
      ],
    },
    {
      type: "paragraph",
      text: "Some things work on every plan: taking payment through paykit, Telegram alerts, walk-up entry, and the Max items per order limit. The TV queue screen, order labels and order-ready push alerts need the qkit plan or a running Event Pass.",
    },
    {
      type: "note",
      text: "Plans are bought and changed in your Merqo account, not in qkit. The Plan page shows your current plan and what each plan includes. Nothing in this guide quotes a price.",
    },

    { type: "heading", level: 2, text: "Where you meet a limit" },
    {
      type: "bullets",
      items: [
        "Menu items: on Free, Add item is replaced by an upgrade prompt once you have 6 items.",
        "Option groups: on Free, an item can carry 3 groups of choices such as size or toppings.",
        "Opening hours: Free shows a locked card instead of the hours editor. You open and pause by hand. Starter and qkit can set hours so ordering stops automatically.",
        "Sold-out limit and Daily item limit: locked on Free, with an upgrade prompt in place of the field.",
        "Stats: Free and Starter show the last 24 hours. qkit adds 7, 30 and 90 day views.",
      ],
    },

    { type: "heading", level: 2, text: "Over plan limit" },
    {
      type: "paragraph",
      text: "On Free you can serve one booth at a time. If you have more than one active booth, for example after an Event Pass ends, the oldest active booth keeps serving and the others show Over plan limit on the Booths page.",
    },
    {
      type: "bullets",
      items: [
        "An Over plan limit booth still exists and you can edit it, but customers cannot order from it.",
        "This is different from Paused, which is the switch you turn yourself. Paused booths come back when you open them.",
        "Moving to the qkit plan or starting an Event Pass serves every active booth again. Nothing is deleted or reset.",
        "On Free, New booth is replaced by Upgrade to add booths once you already have a booth, counting any that are over the limit.",
      ],
    },
    {
      type: "tip",
      text: "Before an Event Pass ends, pause the booths you will not need, so you choose which one stays open instead of the oldest one winning.",
    },
    {
      type: "paragraph",
      text: "A daily item limit you set on a paid plan keeps working after it ends. You can see it and remove it, but not change it.",
    },
    {
      type: "link",
      text: "Limits in Menu and stock",
      href: "/dashboard/help/menu-and-stock",
    },
  ],
};
