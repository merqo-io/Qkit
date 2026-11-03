import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "getting-started",
  category: "getting-started",
  title: "Getting started",
  summary: "Build your first booth, print the QR and take your first order.",
  reviewed: "2026-11-03",
  uiLabels: [
    "Create account",
    "Continue with Google",
    "Add your first booth",
    "New booth",
    "Booth name",
    "Open for orders",
    "Save booth",
    "Add item",
    "Item name",
    "Price",
    "Save menu",
    "Scan to order",
    "Print",
    "Download PNG",
    "Regenerate QR",
    "Resume booth",
    "Incoming",
    "Accepted",
  ],
  covers: [
    "src/app/(auth)/login/page.tsx",
    "src/app/dashboard/booths/booth-form.tsx",
    "src/app/dashboard/booths/menu-manager.tsx",
    "src/app/dashboard/booths/menu-editor.tsx",
    "src/app/dashboard/booths/[boothId]/qr/booth-qr-poster.tsx",
    "src/app/dashboard/booths/[boothId]/qr/regenerate-button.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/realtime-order-board.tsx",
  ],
  body: [
    {
      type: "paragraph",
      text: "This page takes you from a new account to your first order on the board. It needs about ten minutes: sign up, make a booth, add a few menu items, then put the QR where customers can scan it.",
    },

    { type: "heading", level: 2, text: "Create your account" },
    {
      type: "steps",
      items: [
        "Open the qkit sign-up page and choose Create account, or choose Continue with Google.",
        "If you used an email and password, open the confirmation email and click the link, then sign in. Google sign-in skips this step.",
        "You land on your dashboard, which shows No booths yet until you make one.",
      ],
    },
    {
      type: "link",
      text: "Sign-up problems? See Troubleshooting",
      href: "/dashboard/help/troubleshooting",
    },

    { type: "heading", level: 2, text: "Create your first booth" },
    {
      type: "paragraph",
      text: "A booth is one stall or counter that takes its own orders, with its own menu and QR.",
    },
    {
      type: "steps",
      items: [
        "On the dashboard, tap Add your first booth. Later booths are added from the Booths page with New booth.",
        "Type your Booth name. Customers see it at the top of the ordering page. You can add a banner photo too.",
        "On a new booth, leave the Open for orders box ticked to take orders as soon as it is saved. Untick it to keep the booth paused for now.",
        "Everything else on the form can wait. Opening hours that open and close the booth automatically are available on the Event pass and Pro plans.",
        "Tap Save booth.",
      ],
    },
    {
      type: "note",
      text: "Payment and printing sections sit further down the same form. Both are optional. Payments are covered in the Payments guide and label printing in the Printing guide.",
    },
    {
      type: "link",
      text: "Payments",
      href: "/dashboard/help/payments",
    },
    {
      type: "link",
      text: "Printing",
      href: "/dashboard/help/printing",
    },

    { type: "heading", level: 2, text: "Add your menu" },
    {
      type: "paragraph",
      text: "Saving a new booth takes you straight to its menu page.",
    },
    {
      type: "steps",
      items: [
        "Tap Add item, then fill in the Item name. Price is optional: leave it blank for a booth that only runs a queue.",
        "Repeat for each item. You can also add sections, or import a whole menu from a CSV file.",
        "Tap Save menu. For a new booth this takes you to the booth's QR page.",
      ],
    },
    {
      type: "link",
      text: "Read more in Menu and stock",
      href: "/dashboard/help/menu-and-stock",
    },

    { type: "heading", level: 2, text: "Print or display the QR" },
    {
      type: "paragraph",
      text: "The QR page shows a poster headed Scan to order, with your booth name, the code, and the link in text for anyone who cannot scan.",
    },
    {
      type: "steps",
      items: [
        "Tap Print to print the poster, or Download PNG to save the code as an image you can share or put on a sign.",
        "Stick it where customers queue, or show it on a screen.",
        "To open this page again later, go to Booths and tap the QR icon on your booth.",
      ],
    },
    {
      type: "note",
      text: "If the booth is paused, the poster warns you that customers cannot order yet. Open the booth editor and use Resume booth before you print.",
    },
    {
      type: "tip",
      text: "If a QR gets copied around and you want old ones to stop working, use Regenerate QR on the same page. The old code stops working.",
    },

    { type: "heading", level: 2, text: "Watch your first order arrive" },
    {
      type: "steps",
      items: [
        "Scan your own QR on a phone and place a test order.",
        "Open your dashboard. The order shows up on the board under Incoming straight away, with no refresh.",
        "Once you start an order it moves under Accepted. From there you mark it ready, then picked up.",
      ],
    },
    {
      type: "tip",
      text: "Cancel your test order from its menu on the board so it does not count as a real sale.",
    },
    {
      type: "link",
      text: "Next: Running a service",
      href: "/dashboard/help/running-a-service",
    },
  ],
};
