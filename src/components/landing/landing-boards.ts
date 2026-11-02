// Sample data for the 4 landing-hero scenario boards: two that take money (a
// coffee cart, a payment-claim flow) and two queue-only ice cream carts with
// topping options and no payment: one calm, one a rush with an overdue and an
// aging ticket.

import type { LandingBoardData } from "./landing-board";

export const LANDING_BOARDS: LandingBoardData[] = [
  {
    key: "coffee",
    title: "Kopitiam Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0042",
        name: "Ada",
        status: "preparing",
        age: { label: "4m", tone: "aging" },
        payment: "unpaid",
        lines: [{ q: 2, name: "Kopi", opt: "Iced" }],
        action: "Mark Ready",
      },
      {
        n: "0041",
        name: "Wei",
        status: "ready",
        lines: [
          { q: 1, name: "Milo", opt: "Hot" },
          { q: 3, name: "Teh", opt: "Less sugar" },
        ],
        action: "Mark Picked Up",
      },
    ],
  },
  {
    key: "icecream",
    title: "Ice Cream Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0018",
        name: "Mei",
        status: "preparing",
        lines: [
          {
            q: 1,
            name: "Single Scoop",
            options: [
              { group: "Flavour", choice: "Vanilla" },
              { group: "Toppings", choice: "Sprinkles" },
            ],
          },
        ],
        action: "Mark Ready",
      },
      {
        n: "0017",
        name: "Sam",
        status: "ready",
        lines: [
          {
            q: 2,
            name: "Double Scoop",
            options: [
              { group: "Flavour", choice: "Chocolate" },
              { group: "Toppings", choice: "Peanuts, Choc sauce" },
            ],
          },
        ],
        action: "Mark Picked Up",
      },
    ],
  },
  {
    key: "payment",
    title: "Kopitiam Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0031",
        name: "Nur",
        status: "preparing",
        payment: "claimed",
        lines: [{ q: 1, name: "Kopi", opt: "Iced" }],
        action: "Confirm payment received",
      },
      {
        n: "0030",
        name: "Jun",
        status: "completed",
        payment: "paid",
        lines: [{ q: 2, name: "Teh" }],
      },
    ],
  },
  {
    key: "rush",
    title: "Ice Cream Cart",
    activeCount: 2,
    tickets: [
      {
        n: "0056",
        name: "Lim",
        status: "preparing",
        age: { label: "12m", tone: "overdue" },
        lines: [
          {
            q: 2,
            name: "Double Scoop",
            options: [
              { group: "Flavour", choice: "Chocolate" },
              { group: "Toppings", choice: "Peanuts, Sprinkles" },
            ],
          },
        ],
        action: "Mark Ready",
      },
      {
        n: "0057",
        name: "Aisha",
        status: "preparing",
        age: { label: "7m", tone: "aging" },
        lines: [
          {
            q: 1,
            name: "Single Scoop",
            options: [
              { group: "Flavour", choice: "Strawberry" },
              { group: "Toppings", choice: "Choc sauce" },
            ],
          },
        ],
        action: "Mark Ready",
      },
    ],
  },
];
