import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "plans",
  category: "plans",
  title: "Plans",
  summary: "What Free, Pass and Pro include and what Over plan limit means.",
  reviewed: "2026-11-03",
  uiLabels: [
    "Event pass",
    "Monthly Pro",
    "Over plan limit",
    "New booth",
    "Up to 6 menu items",
    "Unlimited items & customization",
    "Extra booths",
    "Scheduled auto-close hours",
    "Sold-out stock caps",
    "This event's stats",
    "Full history & trends (7/30/90d)",
  ],
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
      text: "qkit has three plans: Free, Event pass and Pro. Your current plan is shown at the top of the Plan page. This guide lists what each one allows, and what happens to your booths when your plan changes.",
    },

    { type: "heading", level: 2, text: "What each plan includes" },
    {
      type: "bullets",
      items: [
        "Free: the live order board and QR posters, one booth, up to 6 menu items, up to 3 option groups on an item, and the last 24 hours of stats.",
        "Event pass: everything operational. Unlimited items and customization, extra booths, Scheduled auto-close hours, Sold-out stock caps and the daily item limit, and the This event's stats view on the Plan page, which is the pass's event view. Free and Event pass both see the last 24 hours of stats. It lasts for the dates you pick.",
        "Pro: everything in the pass, plus Full history & trends (7/30/90d) on the Stats page. Monthly Pro is the subscription form of this plan.",
      ],
    },
    {
      type: "paragraph",
      text: "Some things work on every plan: taking payment through paykit, printing, Telegram and push alerts, the TV queue screen, walk-up entry, and the Max items per order limit.",
    },
    {
      type: "note",
      text: "The Plan page is the place to request a pass or ask about Monthly Pro, and it always shows the current offer. Nothing in this guide quotes a price.",
    },

    { type: "heading", level: 2, text: "Where you meet a limit" },
    {
      type: "bullets",
      items: [
        "Menu items: on Free, Add item is replaced by an upgrade prompt once you have 6 items.",
        "Option groups: on Free, an item can carry 3 groups of choices such as size or toppings.",
        "Opening hours: Free shows a locked card instead of the hours editor. You open and pause by hand. Pass and Pro can set hours so ordering stops automatically.",
        "Sold-out limit and Daily item limit: locked on Free, with a Pro prompt in place of the field.",
        "Stats: Free and Pass show the last 24 hours. Pro adds 7, 30 and 90 day views.",
      ],
    },

    { type: "heading", level: 2, text: "Over plan limit" },
    {
      type: "paragraph",
      text: "On Free you can serve one booth at a time. If you have more than one active booth, for example after an Event pass ends, the oldest active booth keeps serving and the others show Over plan limit on the Booths page.",
    },
    {
      type: "bullets",
      items: [
        "An Over plan limit booth still exists and you can edit it, but customers cannot order from it.",
        "This is different from Paused, which is the switch you turn yourself. Paused booths come back when you open them.",
        "Getting a pass or going Pro serves every active booth again. Nothing is deleted or reset.",
        "On Free, New booth is replaced by Upgrade to add booths once you already have a booth, counting any that are over the limit.",
      ],
    },
    {
      type: "tip",
      text: "Before a pass ends, pause the booths you will not need, so you choose which one stays open instead of the oldest one winning.",
    },
    {
      type: "paragraph",
      text: "A daily item limit you set during a pass keeps working after it ends. You can see it and remove it, but not change it.",
    },
    {
      type: "link",
      text: "Limits in Menu and stock",
      href: "/dashboard/help/menu-and-stock",
    },
  ],
};
