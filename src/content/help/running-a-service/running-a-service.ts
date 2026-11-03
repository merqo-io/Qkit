import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "running-a-service",
  category: "running-a-service",
  title: "Running a service",
  summary:
    "Work the live board, log walk-up orders, restart the count and show the TV screen.",
  reviewed: "2026-11-03",
  uiLabels: [
    "Live orders",
    "Incoming",
    "Accepted",
    "Start now",
    "Start all",
    "Accept & start",
    "Accept payment",
    "Decline",
    "Confirm payment received",
    "Mark Ready",
    "Mark Picked Up",
    "Undo",
    "Bump to front",
    "Cancel order",
    "Select",
    "Select all",
    "Clear all",
    "Pick orders",
    "New order",
    "New walk-up order",
    "Customer name",
    "Add items to order",
    "Payment received",
    "Collect later",
    "Walk-up entry by default",
    "Start new service",
    "Start a new service?",
    "Customer screen",
    "Open the screen",
    "Copy the link",
  ],
  covers: [
    "src/app/dashboard/realtime-order-board.tsx",
    "src/app/dashboard/board-booths.tsx",
    "src/app/dashboard/walkup-order-dialog.tsx",
    "src/app/dashboard/walkup-pay-step.tsx",
    "src/app/dashboard/board-batch.tsx",
    "src/app/dashboard/start-service-button.tsx",
    "src/app/dashboard/customer-screen-dialog.tsx",
    "src/components/board/order-card-parts.tsx",
    "src/lib/orders.ts",
  ],
  body: [
    {
      type: "paragraph",
      text: "Your dashboard is the live board. This guide covers a normal service from the first order to the last pickup, plus the extras you will reach for when it gets busy.",
    },

    { type: "heading", level: 2, text: "Read the live board" },
    {
      type: "paragraph",
      text: "The board is headed Live orders. New orders arrive by themselves, with no refresh, and a small notice appears if the connection drops.",
    },
    {
      type: "bullets",
      items: [
        "Incoming holds orders you have not started yet.",
        "Accepted holds orders you have started, from being made through to ready for collection.",
        "On a phone, when both lists have orders, switch between them with the tabs at the top.",
        "With more than one booth, filter the board by booth and sort by order age.",
      ],
    },
    {
      type: "link",
      text: "Board not updating? See Troubleshooting",
      href: "/dashboard/help/troubleshooting",
    },

    { type: "heading", level: 2, text: "Take an order from start to pickup" },
    {
      type: "steps",
      items: [
        "A new order appears under Incoming. Tap Start now to begin making it.",
        "When the food is ready, tap Mark Ready. The customer sees it change on their status page.",
        "When they collect it, tap Mark Picked Up. The order leaves the board.",
      ],
    },
    {
      type: "tip",
      text: "Tapped too early? For a few seconds the button turns into Undo. Tap it to put the order back one step.",
    },
    {
      type: "paragraph",
      text: "Several orders waiting in Incoming? Tap Start all to start every one in a single tap.",
    },
    {
      type: "paragraph",
      text: "To push an urgent order up the queue, open the three-dot menu on its ticket and choose Bump to front. The same menu has Cancel order.",
    },

    { type: "heading", level: 2, text: "Orders with a payment to check" },
    {
      type: "paragraph",
      text: "When a customer says they have paid, the order is flagged for you to check. Open it to see the payment proof, then choose Accept & start to accept the payment and start the order together, or Decline if the payment is not there. Once an order is already started, the button reads Confirm payment received.",
    },
    {
      type: "note",
      text: "Fulfilment and payment are separate. Marking an order ready or picked up does not mark it paid. Confirm the payment yourself on the ticket.",
    },
    {
      type: "link",
      text: "Set up and manage payments",
      href: "/dashboard/help/payments",
    },

    { type: "heading", level: 2, text: "Add a walk-up order" },
    {
      type: "paragraph",
      text: "For a customer at your counter who is not scanning the QR.",
    },
    {
      type: "steps",
      items: [
        "Tap New order at the top of the board. A window titled New walk-up order opens.",
        "With more than one booth, pick the booth first.",
        "Tap the items the customer wants. Items with options open a short picker.",
        "Optionally type a Customer name. If you leave it blank the order is called Walk-up.",
        "Tap the button at the bottom, which reads Add items to order until you add something, then shows the item count and total.",
        "If the booth takes payment, the window then shows the amount and your payment QR. Turn the screen to the customer. Tap Payment received once they have paid in cash or by card, or Collect later to settle after.",
      ],
    },
    {
      type: "paragraph",
      text: "For a one-off event where staff enter every order, tick Walk-up entry by default in the booth settings. The window then clears itself for the next customer after each order.",
    },
    {
      type: "note",
      text: "Orders you key in yourself are not held to the booth's per-order item limit. Items that are sold out cannot be added.",
    },

    { type: "heading", level: 2, text: "Finish many orders at once" },
    {
      type: "paragraph",
      text: "At the end of a rush or an event, clear the board in a few taps.",
    },
    {
      type: "steps",
      items: [
        "Tap Select on the board. A bar appears along the bottom.",
        "Tick the accepted orders you want, or tap Select all. Tap Clear all to untick everything.",
        "Tap Mark Ready for ones still being made, or Mark Picked Up for ones already ready. The buttons show how many orders each will move. With nothing ticked the button reads Pick orders.",
        "A message confirms how many moved and carries an Undo button for a few seconds.",
      ],
    },
    {
      type: "note",
      text: "Select works on orders that are being made or ready. Incoming orders use Start all instead.",
    },

    { type: "heading", level: 2, text: "Start or restart the service count" },
    {
      type: "paragraph",
      text: "If a booth has a daily item limit, it counts every item sold today and starts again from zero at midnight. If you run a morning and an afternoon service, you can restart it yourself.",
    },
    {
      type: "steps",
      items: [
        "Find the booth in the board's booth list and tap its small restart icon, or open the booth's edit page and tap Start new service under Limits.",
        "Check the booth name in the Start a new service? window, then confirm with Start new service.",
        "The item count goes back to 0, so the booth can take a full daily limit again. Orders already placed are not changed.",
      ],
    },
    {
      type: "note",
      text: "The restart button only appears for a booth that has a daily item limit set.",
    },
    {
      type: "link",
      text: "Set a daily item limit in Menu and stock",
      href: "/dashboard/help/menu-and-stock",
    },

    { type: "heading", level: 2, text: "Show the Customer screen" },
    {
      type: "paragraph",
      text: "The Customer screen is a big-number queue display. It shows which orders are being made and which are ready to collect, and needs no login.",
    },
    {
      type: "steps",
      items: [
        "Tap Customer screen on the board, or the TV icon on a booth card on the Booths page. With several booths, choose which one to show.",
        "For a TV or monitor plugged into this computer, tap Open the screen. A new window opens. Drag it onto the TV and make it full screen.",
        "For an iPad or another device, scan the code in the window with its camera, or tap Copy the link and open it there.",
      ],
    },
    {
      type: "tip",
      text: "If nothing opens, your browser probably blocked the pop-up. Allow pop-ups for qkit, or use the code or link instead.",
    },
  ],
};
