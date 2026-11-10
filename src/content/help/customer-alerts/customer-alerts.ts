import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "customer-alerts",
  category: "customer-alerts",
  title: "Customer alerts",
  summary: "What customers see at each stage and how ready alerts reach them.",
  reviewed: "2026-11-10",
  uiLabels: [
    "Alert me when it's ready",
    "Notify customers on Telegram when their order is ready",
    "Notifications",
    "Desktop notifications",
    "New-order sound",
    "Customer screen",
    "Enable sound",
    "Preparing",
    "Ready for pickup",
  ],
  covers: [
    "src/lib/order-alerts.ts",
    "src/lib/push/send.ts",
    "src/lib/merqo/customer-notify.ts",
    "src/app/dashboard/settings/settings-form.tsx",
    "src/app/dashboard/order-action-helpers.ts",
    "src/app/dashboard/order-advance-actions.ts",
    "src/app/dashboard/customer-screen-dialog.tsx",
    "src/app/o/[code]/notify.ts",
    "src/app/order/[boothId]/[orderNumber]/order-status-poller.tsx",
    "src/app/order/[boothId]/[orderNumber]/telegram-connect.tsx",
    "src/app/order/[boothId]/display/queue-display.tsx",
  ],
  body: [
    {
      type: "paragraph",
      text: "Customers do not need to stand at your counter. After they order, they watch their order on their own phone, and you can also put the queue on a screen. This guide covers every way a customer finds out their order is ready, and the alerts you get for new orders.",
    },

    { type: "heading", level: 2, text: "The customer's order page" },
    {
      type: "paragraph",
      text: "The page a customer lands on after ordering updates by itself. It shows where the order is in the queue and, if you have wait estimates on, a rough wait. It flips to Ready within moments of you tapping Mark Ready.",
    },
    {
      type: "bullets",
      items: [
        "Alert me when it's ready is a button on the page. Tapping it turns on a chime and, where the phone allows, a popup when the order is ready.",
        "The popup works on Android and desktop browsers. On an iPhone it needs qkit added to the home screen. Where popups are not possible, the page chimes while it stays open.",
        "A customer who allowed alerts can also get a push message when the page is closed, sent when you tap Mark Ready.",
      ],
    },
    {
      type: "note",
      text: "Customers choose these alerts themselves. You cannot turn on a customer's browser alerts for them.",
    },

    { type: "heading", level: 2, text: "Telegram for customers" },
    {
      type: "paragraph",
      text: "While an order is not yet ready, its page also offers a Telegram link, worded Get notified on Telegram when it's ready. It opens a chat with Merqo's bot, which messages the customer when you mark the order ready. The customer's Telegram connection belongs to Merqo, not to qkit, and it can be used by other Merqo apps too. The page explains this to them.",
    },
    {
      type: "steps",
      items: [
        "Go to Settings and find the Notifications card.",
        "Turn on or off Notify customers on Telegram when their order is ready.",
        "The switch saves the moment you flip it.",
      ],
    },
    {
      type: "bullets",
      items: [
        "The switch is on unless you turn it off. Turning it off stops your booths using the Telegram ping, and does not disconnect the customer.",
        "If Merqo is unreachable, the Telegram link is simply left off the page. Ordering and your Mark Ready tap are never held up.",
        "Telegram and the browser alerts above are the only ways customers are alerted.",
      ],
    },

    { type: "heading", level: 2, text: "Show the queue on a screen" },
    {
      type: "paragraph",
      text: "The Customer screen button on the live board opens a public queue display for the booth. It lists order numbers under Preparing and Ready for pickup, with no names, and needs no login.",
    },
    {
      type: "steps",
      items: [
        "On the live board, tap Customer screen.",
        "On a TV or monitor plugged into this computer, tap Open the screen and drag the new window onto the TV.",
        "On an iPad or another device, scan the code with its camera, or copy the link.",
        "Tap Enable sound on the screen once, so it can chime when an order turns ready. Browsers need a tap before they play sound.",
      ],
    },

    { type: "heading", level: 2, text: "Alerts for you" },
    {
      type: "bullets",
      items: [
        "New-order sound in Settings picks the chime that plays when an order lands while the board tab is open.",
        "Desktop notifications, in the same Notifications card, shows a popup for a new order when the board tab is in the background. It is allowed per browser, so you may need to allow it on each device you use.",
        "Telegram: each new order can also send you a message through Merqo's bot. You connect Telegram once on your Merqo profile page, outside qkit. If you have not connected it, no message is sent. Vendors who used qkit's old bot need to connect again there.",
      ],
    },
    {
      type: "tip",
      text: "Keep the board tab open and the sound on during service. A tab that is asleep cannot chime.",
    },
    {
      type: "link",
      text: "Not getting alerts? See Troubleshooting",
      href: "/dashboard/help/troubleshooting",
    },
  ],
};
