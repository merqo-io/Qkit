import type { HelpArticle } from "../types";

export const article: HelpArticle = {
  slug: "troubleshooting",
  category: "troubleshooting",
  title: "Troubleshooting",
  summary:
    "Quick fixes for sign-up, the live board, payments, booths that will not take orders, QR codes, photos and stats.",
  reviewed: "2026-11-11",
  uiLabels: [
    "Check your email",
    "Create account",
    "Live updates interrupted, reconnecting",
    "Says paid. Check the payment",
    "View payment proof",
    "Accept & start",
    "Accept payment",
    "Decline",
    "Confirm payment received",
    "Over plan limit",
    "This booth isn't taking orders right now",
    "This code expired. Please rescan.",
    "Sorry, an item just sold out. Please adjust your order.",
    "This stall has served everything it had.",
    "That is more than this stall takes in one order",
    "Too many orders too fast. Wait a moment and try again.",
    "Max items per order",
    "Daily item limit",
    "Regenerate QR",
    "QR expired",
  ],
  covers: [
    "src/app/(auth)/login/page.tsx",
    "src/app/dashboard/realtime-order-board.tsx",
    "src/components/board/order-card-parts.tsx",
    "src/lib/ticket.ts",
    "src/app/dashboard/booths/booth-list.tsx",
    "src/app/dashboard/booths/actions.ts",
    "src/app/o/[code]/actions.ts",
    "src/components/order/expired-code.tsx",
    "src/app/dashboard/booths/[boothId]/qr/regenerate-button.tsx",
    "src/lib/booth/access.ts",
    "src/lib/hours.ts",
    "src/lib/plan.ts",
  ],
  body: [
    {
      type: "paragraph",
      text: "Find the symptom, then work down its list. If none of it fits, use Get help in your account menu and tell us what you saw.",
    },

    {
      type: "heading",
      level: 2,
      text: "I signed up but never reached a dashboard",
    },
    {
      type: "paragraph",
      text: "Signing up with an email and password needs one extra step.",
    },
    {
      type: "steps",
      items: [
        "After Create account you see a Check your email screen. No session starts until you click the link in that email.",
        "Open the email (check spam), click the link, then sign in with the same email and password.",
      ],
    },
    {
      type: "tip",
      text: "Signing in with Google does not use a confirmation email.",
    },

    {
      type: "heading",
      level: 2,
      text: "New orders stopped appearing on my board",
    },
    {
      type: "paragraph",
      text: "The board updates in real time. If the connection drops, for example because the tab was asleep or the wifi is patchy, a notice appears at the top reading Live updates interrupted, reconnecting.",
    },
    {
      type: "bullets",
      items: [
        "New orders may be delayed while the notice is showing. The board re-syncs on its own once the connection is back.",
        "If the notice stays or the board still looks stuck, reload the page.",
        "Keeping the tab in the foreground helps.",
      ],
    },

    {
      type: "heading",
      level: 2,
      text: "A customer says they paid but the order still shows unpaid",
    },
    {
      type: "paragraph",
      text: "Customers pay on a payment page run by paykit, not inside qkit. When a customer marks an order as paid, its ticket on your board shows Says paid. Check the payment. Nothing marks the order as paid until you do.",
    },
    {
      type: "steps",
      items: [
        "Open the order and tap View payment proof to see what the customer sent.",
        "Check that the money landed in your account for the right amount.",
        "Tap Accept & start to confirm the payment and start the order, or Decline to send it back to unpaid so the customer can try again. Once the order has been started, the same button reads Accept payment.",
        "On a started order's ticket, the Confirm payment received button also confirms a claimed payment without opening the proof.",
      ],
    },
    {
      type: "note",
      text: "Starting, readying or handing over an order never confirms its payment. Only accepting the payment does.",
    },
    {
      type: "link",
      text: "Setting up payments and what the customer sees (paykit)",
      href: "https://paykit.merqo.io",
    },

    {
      type: "heading",
      level: 2,
      text: "My booth is Open but customers cannot order",
    },
    {
      type: "paragraph",
      text: "A booth takes orders only when it is Open (not paused), inside its scheduled hours if you set any, and within your plan's booth limit. Customers who hit a booth that is not serving see This booth isn't taking orders right now.",
    },
    {
      type: "bullets",
      items: [
        "The Free plan serves one booth at a time. If you have more than one open booth, only the oldest open booth serves. The others show Over plan limit on the Booths page even though they are open.",
        "Pause the extra booths, or move to a plan with more booths from the Plan page in your account menu.",
        "A booth can also stop for a daily limit (Starter, Pro and Event Pass). See the sold out and limit messages below.",
      ],
    },

    {
      type: "heading",
      level: 2,
      text: "My booth is Open but shows closed during the hours I set",
    },
    {
      type: "bullets",
      items: [
        "Scheduled hours are always read in Singapore time (SGT), whatever time zone your phone is in. Check your hours against SGT.",
        "Scheduled hours are part of the Starter and Pro plans and an Event Pass. On Free, saving a booth clears any scheduled hours, and the booth takes orders whenever it is Open and stops when you pause it.",
      ],
    },

    {
      type: "heading",
      level: 2,
      text: "A customer says their order did not go through",
    },
    {
      type: "paragraph",
      text: "The customer sees one of these messages. Each one has a different fix.",
    },
    {
      type: "bullets",
      items: [
        "This code expired. Please rescan. The QR or short code was regenerated, so they need to scan the current one.",
        "This booth isn't taking orders right now. The booth is paused, over your plan limit, or outside its hours.",
        "Sorry, an item just sold out. Please adjust your order. An item ran out or was switched off while they were ordering.",
        "This stall has served everything it had. The booth reached its Daily item limit. It starts again at midnight, or sooner when you tap the New service button beside the booth on the board.",
        "That is more than this stall takes in one order. The order is over the booth's Max items per order. You can raise or clear the limit on the booth's edit page, and orders you key in yourself are not limited.",
        "Too many orders too fast. Wait a moment and try again. One phone can place about 8 orders a minute and one network about 60, so a shared wifi rarely hits it. It clears within a minute.",
      ],
    },
    {
      type: "note",
      text: "Ask them to rescan the QR and try again. A retry of the same attempt does not create a second order.",
    },

    {
      type: "heading",
      level: 2,
      text: "I regenerated my QR and my printed codes stopped working",
    },
    {
      type: "paragraph",
      text: "Regenerate QR is instant and permanent. Every printed or saved code for that booth stops working immediately, and there is no grace period. Customers who scan an old one see QR expired.",
    },
    {
      type: "bullets",
      items: [
        "Only regenerate if a code leaked or is being misused.",
        "Reprint the new QR right away.",
      ],
    },

    {
      type: "heading",
      level: 2,
      text: "My banner or menu photo will not upload",
    },
    {
      type: "bullets",
      items: [
        "Use a JPEG, PNG or WebP image. SVG and HEIC are not accepted. Large phone photos are fine, they are optimised as they upload.",
        "A failed upload is usually a flaky connection. Wait a moment and try again.",
        "The photo only sticks once you save the booth or item. The preview swaps straight away, but nothing is stored until you save.",
      ],
    },

    { type: "heading", level: 2, text: "My stats only show the last 24 hours" },
    {
      type: "paragraph",
      text: "The 7, 30 and 90 day ranges are part of the Pro plan and a running Event Pass. Free and Starter accounts see the 24 hour view.",
    },
  ],
};
