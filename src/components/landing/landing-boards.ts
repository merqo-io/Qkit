import type { SampleOrder } from "./sample-ticket";

export type LandingBoardData = {
  key: string;
  title: string;
  lead: string;
  caption: string;
  orders: SampleOrder[];
};

// Five sample boards, one per thing the board does for a vendor: finish an
// order, start one, check a payment, spot the oldest ticket, hand one over.
// The amber and red minutes are the vendor's own setting, so the rush caption
// calls 7 and 12 an example.
export const LANDING_BOARDS: LandingBoardData[] = [
  {
    key: "ready",
    title: "Kopitiam Cart",
    lead: "Mark Ready.",
    caption:
      "Ada's kopi is done. Her ticket also tells you she hasn't paid yet.",
    orders: [
      {
        number: "0042",
        name: "Ada",
        status: "preparing",
        ageMins: 4,
        payment: "pending",
        items: [{ quantity: 2, name: "Kopi", options: ["Iced"] }],
        action: "Mark Ready",
      },
      {
        number: "0041",
        name: "Wei",
        status: "ready",
        ageMins: 6,
        items: [
          { quantity: 1, name: "Milo", options: ["Hot"] },
          { quantity: 3, name: "Teh", options: ["Less sugar"] },
        ],
        action: "Mark Picked Up",
      },
    ],
  },
  {
    key: "start",
    title: "Ice Cream Cart",
    lead: "Start.",
    caption: "A new order waits for you to begin it.",
    orders: [
      {
        number: "0019",
        name: "Tom",
        status: "pending",
        ageMins: 1,
        items: [
          {
            quantity: 1,
            name: "Single Scoop",
            options: ["Mango", "Sprinkles"],
          },
        ],
        action: "Start now",
      },
      {
        number: "0018",
        name: "Mei",
        status: "preparing",
        ageMins: 3,
        items: [
          {
            quantity: 1,
            name: "Single Scoop",
            options: ["Vanilla", "Sprinkles"],
          },
        ],
        action: "Mark Ready",
      },
    ],
  },
  {
    key: "payment",
    title: "Kopitiam Cart",
    lead: "Says paid.",
    caption: "Nur paid by PayNow. Check your bank app, then confirm.",
    orders: [
      {
        number: "0031",
        name: "Nur",
        status: "preparing",
        ageMins: 2,
        payment: "claimed",
        amount: "$2.40",
        items: [{ quantity: 1, name: "Kopi", options: ["Iced"] }],
        action: "Confirm payment received",
      },
      {
        number: "0030",
        name: "Jun",
        status: "completed",
        items: [{ quantity: 2, name: "Teh" }],
      },
    ],
  },
  {
    key: "rush",
    title: "Ice Cream Cart",
    lead: "Rush.",
    caption:
      "You choose when a ticket turns amber and red. Here it's 7 and 12 minutes, so the oldest stands out.",
    orders: [
      {
        number: "0056",
        name: "Lim",
        status: "preparing",
        ageMins: 12,
        tone: "overdue",
        items: [
          {
            quantity: 2,
            name: "Double Scoop",
            options: ["Chocolate", "Peanuts, Sprinkles"],
          },
        ],
        action: "Mark Ready",
      },
      {
        number: "0057",
        name: "Aisha",
        status: "preparing",
        ageMins: 7,
        tone: "aging",
        items: [
          {
            quantity: 1,
            name: "Single Scoop",
            options: ["Strawberry", "Choc sauce"],
          },
        ],
        action: "Mark Ready",
      },
    ],
  },
  {
    key: "handover",
    title: "Ice Cream Cart",
    lead: "Ready.",
    caption:
      "Sam's phone already says to collect. Tap Mark Picked Up, or let it clear itself after the minutes you set.",
    orders: [
      {
        number: "0018",
        name: "Mei",
        status: "preparing",
        ageMins: 5,
        items: [
          {
            quantity: 1,
            name: "Single Scoop",
            options: ["Vanilla", "Sprinkles"],
          },
        ],
        action: "Mark Ready",
      },
      {
        number: "0017",
        name: "Sam",
        status: "ready",
        ageMins: 8,
        items: [
          {
            quantity: 2,
            name: "Double Scoop",
            options: ["Chocolate", "Peanuts, Choc sauce"],
          },
        ],
        action: "Mark Picked Up",
        drain: true,
      },
    ],
  },
];
