import type { OrderStatus } from "@/lib/types";

// What the page says at each status: a headline naming where things stand, and
// one line of what to do about it. Written as the stall talking ("we're making
// it"), not as a system reporting a field, and never more than the customer
// can act on right now.
const STATUS_COPY: Record<OrderStatus, { headline: string; detail: string }> = {
  pending: {
    headline: "We've got your order",
    detail: "The stall will start on it shortly.",
  },
  confirmed: {
    headline: "We've got your order",
    detail: "The stall will start on it shortly.",
  },
  preparing: {
    headline: "We're making it now",
    detail: "Stay close. This page turns to Ready the moment it is.",
  },
  // No order number here: it is already the biggest thing above this line.
  ready: {
    headline: "It's ready",
    detail: "Come to the counter to collect it.",
  },
  completed: {
    headline: "Collected. Enjoy!",
    detail: "Thanks for ordering.",
  },
  cancelled: {
    headline: "This order was cancelled",
    detail: "The stall will not be making it.",
  },
};

// A cancelled order the customer says they paid for: the one thing they need
// is how to get their money back, and qkit never holds it.
const CANCELLED_AFTER_PAYMENT_DETAIL =
  "If you already paid, show this page to the stall for a refund.";

// Overrides for the same statuses while the stall is still checking a payment
// the customer has sent — the kitchen may already be moving, but the text must
// not imply payment is settled when it isn't, nor ask again for a payment
// already made. "completed"/"cancelled" aren't listed: a cancelled order never
// shows the pay panel (see order-status page's showPay gate).
const PAYMENT_CHECK_COPY: Partial<
  Record<OrderStatus, { headline: string; detail: string }>
> = {
  confirmed: {
    headline: "We've got your order",
    detail: "The stall starts once it has checked your payment.",
  },
  preparing: {
    headline: "We're making it now",
    detail: "The stall is still checking your payment. Stay close.",
  },
  ready: {
    headline: "It's ready",
    detail: "Come to the counter. The stall will check your payment there.",
  },
};

/** What to say once the page has lost touch with the stall's board. */
export function staleNotice(lastCheckedAt: number | null): string {
  if (lastCheckedAt === null) return "No connection. Trying again.";
  const time = new Date(lastCheckedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `No connection. Last checked ${time}.`;
}

type StatusCopy = { headline: string; detail: string };

/** The headline and the one line under it for where an order stands. */
export function statusCopy(
  status: OrderStatus,
  {
    needsArrival,
    awaitingPayment,
    paymentSent,
  }: {
    needsArrival: boolean;
    awaitingPayment: boolean;
    paymentSent: boolean;
  },
): StatusCopy {
  if (needsArrival)
    return {
      headline: "Tap when you're at the counter",
      detail: "We make it fresh, so we start once you arrive.",
    };
  if (status === "cancelled" && paymentSent)
    return {
      headline: STATUS_COPY.cancelled.headline,
      detail: CANCELLED_AFTER_PAYMENT_DETAIL,
    };
  if (awaitingPayment) return PAYMENT_CHECK_COPY[status] ?? STATUS_COPY[status];
  return STATUS_COPY[status];
}
