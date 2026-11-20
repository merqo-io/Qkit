import { cn } from "@merqo/ui/primitives";
import { Banknote, Image as ImageIcon } from "lucide-react";
import { TicketItems } from "@/components/board/order-card-parts";
import {
  AttentionLine,
  TicketFooter,
} from "@/components/board/order-card-footer";
import { OrderStatusBadge } from "@/components/board/order-status-badge";
import { Ticket } from "@/components/widgets/ticket";
import { splitTrailingDigit, type AgeTone } from "@/lib/orders";
import { parseOrderItems } from "@/lib/schemas";
import { ticketAttention } from "@/lib/ticket";
import type { OrderStatus } from "@/lib/types";

export type SampleOrder = {
  number: string;
  name: string;
  status: OrderStatus;
  ageMins?: number;
  tone?: AgeTone;
  payment?: "pending" | "claimed";
  amount?: string;
  items: { name: string; quantity: number; options?: string[] }[];
  action?: string;
  drain?: boolean;
};

// Same priority as the board's own wash: late food outranks an unconfirmed
// payment, which outranks merely aging. A closed ticket skips the age tones.
function wash(order: SampleOrder, closed: boolean) {
  if (!closed && order.tone === "overdue") return "ticket-overdue";
  if (order.payment === "claimed") return "ticket-alert";
  if (!closed && order.tone === "aging") return "ticket-aging";
  return "border-border";
}

// min-h, not a fixed height: on a narrow two-column card a long label such as
// "Confirm payment received" wraps to three lines and a fixed h-12 clips it.
const ACTION_BASE =
  "relative flex min-h-12 w-full items-center overflow-hidden rounded-lg px-3 py-2 text-base leading-tight font-semibold whitespace-normal";

/**
 * One sample ticket for the hero, put together from the board's own parts so
 * it cannot drift from the real card. Everything the real card wires to server
 * actions (the more menu, the buttons) is drawn as plain text here, since a
 * sample has nothing to act on.
 */
export function SampleTicket({ order }: { order: SampleOrder }) {
  const closed = order.status === "completed";
  const split = splitTrailingDigit(order.number);
  const attention = ticketAttention({
    status: order.status,
    paymentStatus: order.payment ?? "not_required",
    printStatus: null,
    overtaken: false,
  });
  const items = parseOrderItems(
    order.items.map((item, i) => ({
      menuItemId: `${order.number}-${i}`,
      name: item.name,
      quantity: item.quantity,
      options: item.options?.map((choice) => ({ group: "Option", choice })),
    })),
  );
  const claimed = order.payment === "claimed";

  return (
    <Ticket
      radius="xl"
      shadow="none"
      borderColor="custom"
      className={cn(
        "flex w-full min-w-0 flex-col shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]",
        wash(order, closed),
        closed && "self-start",
      )}
    >
      <div className="px-4 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="font-mono text-3xl leading-none font-bold tracking-tight">
            #{split.lead}
            <span className="text-primary">{split.last}</span>
          </h3>
          {closed && <OrderStatusBadge status={order.status} />}
        </div>
        <p className="mt-1.5 text-base leading-snug font-medium break-words">
          {order.name}
        </p>
      </div>

      {attention && <AttentionLine attention={attention} />}

      <div className="perforation mx-4" />

      <TicketItems items={items} showPrices={false} />

      {claimed && (
        <div className="px-4 pb-3">
          <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs font-semibold text-muted-foreground">
            <ImageIcon className="size-3.5" aria-hidden="true" />
            View payment proof
          </span>
        </div>
      )}

      {order.action && (
        <div className="mt-auto px-4 pb-3">
          <span
            className={cn(
              ACTION_BASE,
              claimed
                ? "justify-start gap-2 bg-status-payment-claimed font-bold text-white"
                : "justify-center bg-primary text-primary-foreground",
            )}
          >
            {order.drain && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-2/5 bg-black/10"
              />
            )}
            {claimed && (
              <Banknote className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="relative min-w-0">{order.action}</span>
            {order.amount && (
              <span className="relative ml-auto shrink-0 pl-3 font-mono tabular-nums">
                {order.amount}
              </span>
            )}
          </span>
        </div>
      )}

      {!closed && (
        <TicketFooter
          ageMins={order.ageMins ?? null}
          tone={order.tone ?? "fresh"}
          status={order.status}
          awaitingArrival={false}
        />
      )}
    </Ticket>
  );
}
