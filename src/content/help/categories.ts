import type { HelpCategory } from "./types";

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "From your first booth to your first order.",
  },
  {
    id: "running-a-service",
    title: "Running a service",
    description: "The live board, walk-up orders and the customer TV screen.",
  },
  {
    id: "menu-and-stock",
    title: "Menu and stock",
    description: "Items, daily limits and what stops customers over-ordering.",
  },
  {
    id: "payments",
    title: "Payments",
    description: "Payment claims and confirming that you were paid.",
  },
  {
    id: "printing",
    title: "Printing",
    description: "Per-item labels for your cups and bags.",
  },
  {
    id: "customer-alerts",
    title: "Customer alerts",
    description: "How customers hear that their order is ready.",
  },
  {
    id: "plans",
    title: "Plans",
    description: "What each plan includes and what the limits mean.",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    description: "Quick fixes for the most common stall-side snags.",
  },
];
