import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "payments",
  category: "payments",
  title: "Payments",
  summary:
    "Handle payment claims, confirm that you were paid and settle walk-up orders.",
  reviewed: "2026-11-03",
  uiLabels: [
    "Take payment",
    "Set up payments in paykit",
    "View payment proof",
    "Accept & start",
    "Accept payment",
    "Decline",
    "Says paid. Check the payment",
    "Confirm payment received",
    "Mark paid & start",
    "Mark as paid",
    "Not paid yet",
    "Payment sent. The stall is checking it.",
    "Tapped by mistake? Undo",
    "Payment confirmed",
    "Payment received",
    "Collect later",
    "Paykit booking ID",
  ],
  covers: [
    "src/components/board/order-card-parts.tsx",
    "src/components/board/order-card.tsx",
    "src/app/dashboard/order-payment-actions.ts",
    "src/app/dashboard/booths/payment-section.tsx",
    "src/app/dashboard/booths/booking-status-section.tsx",
    "src/app/dashboard/walkup-pay-step.tsx",
    "src/app/order/[boothId]/pay/page.tsx",
    "src/app/order/[boothId]/[orderNumber]/pay-panel.tsx",
    "src/lib/paykit/client.ts",
    "src/lib/ticket.ts",
  ],
  body: [
    {
      type: "paragraph",
      text: "qkit does not process payments itself. Your payment details and the customer's payment page belong to paykit, a sibling Merqo app. This guide covers what you set up in qkit, what customers see, and what you tap on the board.",
    },

    { type: "heading", level: 2, text: "Set up payment for a booth" },
    {
      type: "steps",
      items: [
        "Go to Booths, tap Edit on your booth and open the Payment section.",
        "If the line under the switch says no payment details are on file, tap Set up payments in paykit. It opens paykit in a new tab, where you enter your PayNow, payment link or QR image once.",
        "Come back to qkit and turn on Take payment.",
        "Tap Save booth.",
      ],
    },
    {
      type: "bullets",
      items: [
        "Your details are kept in paykit and shared by every booth. qkit only names what is on file, for example a PayNow QR paid to your name. A link in the section reopens paykit when you need to change them.",
        "Take payment is locked off until paykit has something on file. It is also locked if qkit cannot reach paykit, and the booth keeps its current setting.",
        "With Take payment off, customers just join the queue and settle up with you at the counter.",
      ],
    },

    { type: "heading", level: 2, text: "What the customer sees" },
    {
      type: "steps",
      items: [
        "The customer places an order. When the booth takes payment, they are sent to paykit's own payment page and pay there.",
        "They come back to the order page, which says Payment sent. The stall is checking it. They get their order number once payment has been sent.",
        "If they tapped by mistake, Tapped by mistake? Undo puts the order back to unpaid so they can pay again.",
        "When you confirm, the page changes to Payment confirmed on its own.",
      ],
    },
    {
      type: "note",
      text: "If an unpaid order is cancelled or expires, the customer sees a message telling them not to pay for it.",
    },

    { type: "heading", level: 2, text: "Confirm payment on the board" },
    {
      type: "paragraph",
      text: "A ticket that needs a look shows one line on it, such as Says paid. Check the payment. Which button you get depends on the order's stage.",
    },
    {
      type: "bullets",
      items: [
        "New order, customer says they paid: the ticket shows both View payment proof and Mark paid & start. Tap View payment proof, check it against your bank or paykit, then tap Accept & start. That confirms the payment and starts the order in one tap. Decline sends the claim back to unpaid, and the customer can pay again. If you have already checked the money yourself, Mark paid & start does the same without opening the proof.",
        "New order, no claim yet: only Mark paid & start shows. It confirms payment and starts the order in one tap.",
        "Order already started, customer says they paid: Confirm payment received. Opening the proof there reads Accept payment instead of Accept & start.",
        "Order already started, still unpaid: Mark as paid. The ticket shows Not paid yet until you do. Use it when the customer paid you in person.",
      ],
    },
    {
      type: "tip",
      text: "Mark paid & start and Accept & start can be undone for a few seconds, like Mark Ready. How long is set by Undo window in Settings.",
    },

    { type: "heading", level: 2, text: "Payment is separate from pickup" },
    {
      type: "paragraph",
      text: "Marking an order Ready or Picked Up never marks it paid. Only the payment buttons above do that. This keeps your records honest when a customer collects before paying.",
    },
    {
      type: "bullets",
      items: [
        "A Picked Up order that is still unpaid keeps its Mark as paid or Confirm payment received button, so you can settle it later.",
        "A cancelled order never asks for payment.",
        "If paykit cannot be reached, pickup still works and the order stays unpaid. Try the confirm button again when it is back.",
      ],
    },

    { type: "heading", level: 2, text: "Walk-up orders" },
    {
      type: "paragraph",
      text: "When you key in an order for someone at the counter and the booth takes payment, the order dialog ends on a payment step. It shows the amount to pay and a QR to scan, or a link for the customer to open.",
    },
    {
      type: "bullets",
      items: [
        "Tap Payment received once you have seen the payment arrive.",
        "Tap Collect later to skip it. The ticket stays unpaid and keeps its own Mark as paid.",
        "If the QR cannot load, take payment another way, then tap Payment received.",
      ],
    },

    { type: "heading", level: 2, text: "Event bookings" },
    {
      type: "paragraph",
      text: "A booth with Walk-up entry by default turned on has an optional Paykit booking ID box. If you have set up a deposit and balance booking in paykit, paste its ID there and save. The booth's edit page then shows whether the deposit and balance are paid.",
    },
    {
      type: "link",
      text: "Payment stuck? See Troubleshooting",
      href: "/dashboard/help/troubleshooting",
    },
  ],
};
