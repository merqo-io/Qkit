import type { BoardOrder, OrderStatus, PaymentStatus } from "@/lib/types";

export type SampleOrder = {
  number: string;
  name: string;
  status: OrderStatus;
  ageMins: number;
  readyAgoMins?: number;
  payment?: PaymentStatus;
  items: {
    name: string;
    quantity: number;
    priceCents?: number;
    options?: string[];
  }[];
};

export type LandingBoardData = {
  key: string;
  title: string;
  lead: string;
  caption: string;
  orders: SampleOrder[];
};

// The amber and red minutes the hero's tickets are drawn with; the rush
// caption quotes them.
export const SAMPLE_AGING_MIN = 7;
export const SAMPLE_OVERDUE_MIN = 12;

// A ready ticket's drain bar runs for what is left of this window, so each
// board shows it moving for a while after it is seeded.
export const SAMPLE_AUTO_CLEAR_MS = 3 * 60_000;

const MINUTE_MS = 60_000;

/**
 * Turns a sample into the board's own `BoardOrder` row, so the hero draws the
 * real ticket. Timestamps are relative to `seedMs`: ages and the drain bar read
 * sensibly whenever a board is seeded, and the carousel re-seeds a board each
 * time it comes into view.
 */
export function toBoardOrder(sample: SampleOrder, seedMs: number): BoardOrder {
  const created = new Date(seedMs - sample.ageMins * MINUTE_MS).toISOString();
  const readyAt =
    sample.status === "ready"
      ? new Date(
          seedMs - (sample.readyAgoMins ?? 0.5) * MINUTE_MS,
        ).toISOString()
      : null;
  const items = sample.items.map((item, i) => ({
    menuItemId: `${sample.number}-${i}`,
    name: item.name,
    quantity: item.quantity,
    ...(item.priceCents === undefined ? {} : { price_cents: item.priceCents }),
    options: item.options?.map((choice) => ({ group: "Option", choice })),
  }));
  const priced = sample.items.every((item) => item.priceCents !== undefined);
  const payment = sample.payment ?? "not_required";
  return {
    id: `sample-${sample.number}`,
    booth_id: "sample-booth",
    order_number: sample.number,
    customer_name: sample.name,
    items,
    status: sample.status,
    total_cents: priced
      ? sample.items.reduce(
          (sum, item) => sum + (item.priceCents ?? 0) * item.quantity,
          0,
        )
      : 0,
    payment_status: payment,
    payment_method_kind: payment === "not_required" ? null : "paynow",
    paid_at: null,
    payment_proof_path: null,
    payment_proof_hash: null,
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: created,
    ready_at: readyAt,
    completed_at: null,
    updated_at: created,
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
  };
}

// Five sample boards, one per thing the board does for a vendor: finish an
// order, start one, check a payment, spot the oldest ticket, hand one over.
// Every ticket is active, so each board's "N active" is just its length.
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
        items: [
          { quantity: 2, name: "Kopi", priceCents: 120, options: ["Iced"] },
        ],
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
        items: [
          { quantity: 1, name: "Kopi", priceCents: 240, options: ["Iced"] },
        ],
      },
      {
        number: "0030",
        name: "Jun",
        status: "ready",
        ageMins: 5,
        payment: "confirmed",
        items: [{ quantity: 2, name: "Teh", priceCents: 140 }],
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
        items: [
          {
            quantity: 2,
            name: "Double Scoop",
            options: ["Chocolate", "Peanuts, Sprinkles"],
          },
        ],
      },
      {
        number: "0057",
        name: "Aisha",
        status: "preparing",
        ageMins: 7,
        items: [
          {
            quantity: 1,
            name: "Single Scoop",
            options: ["Strawberry", "Choc sauce"],
          },
        ],
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
      },
    ],
  },
];
