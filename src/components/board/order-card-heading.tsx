"use client";

import { Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderStatusBadge } from "@/components/board/order-status-badge";
import { boothDotTitle } from "@/lib/booth/color";
import { splitTrailingDigit } from "@/lib/orders";
import type { BoardOrder, OrderStatus } from "@/lib/types";
import { TicketMenu } from "./order-card-parts";

function showsWalkupTag(order: BoardOrder): boolean {
  return (
    order.source === "walkup" &&
    order.customer_name.trim().toLowerCase() !== "walk-up"
  );
}

/** The ticket's top block: select box, booth, number, name and "more" menu. */
export function TicketHeading({
  order,
  number,
  status,
  closed,
  bumped,
  boothName,
  boothColor,
  selectable,
  selected,
  onToggleSelect,
  menuDisabled,
  onBump,
  onCancel,
}: {
  order: BoardOrder;
  number: string | null;
  status: OrderStatus;
  closed: boolean;
  bumped: boolean;
  boothName?: string;
  boothColor?: string;
  selectable: boolean;
  selected: boolean;
  onToggleSelect?: (orderId: string) => void;
  menuDisabled: boolean;
  onBump?: () => void;
  onCancel?: () => void;
}) {
  const numberSplit = splitTrailingDigit(number);
  return (
    <div className="flex items-start gap-3 px-4 pt-5 pb-3">
      {selectable && (
        // The label is the touch target: the box itself is 16px, far too
        // small to hit mid-service, so the padding around it (pulled back
        // with a matching negative margin, leaving the layout as it was)
        // makes 44px of it tappable.
        <label className="-m-3.5 flex shrink-0 cursor-pointer p-3.5">
          <Checkbox
            className="mt-1.5"
            checked={selected}
            onCheckedChange={() => onToggleSelect?.(order.id)}
            aria-label={`Select order #${number}`}
          />
        </label>
      )}
      <div className="min-w-0 flex-1">
        {/* Only in multi-booth view. Same boothColors() colour as the board's
            filter, so the colour still carries onto the ticket, but as one
            quiet line: the number below is what gets called out. */}
        {boothName && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: boothColor }}
              title={boothDotTitle(boothName)}
              aria-hidden="true"
            />
            <span className="truncate">{boothName}</span>
          </p>
        )}
        {/* The number is the most-scanned thing on the board, read
            one-handed and often with wet hands, so it is the largest thing
            on the ticket and nothing else competes with it. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="font-mono text-3xl leading-none font-bold tracking-tight">
            #{numberSplit.lead}
            {/* Emphasized: staff slotting a pickup by a physical shelf's
                last-digit position (bubble-tea-chain style) read this digit
                first. */}
            <span className="text-primary">{numberSplit.last}</span>
          </h3>
          {!closed && bumped && (
            <Zap
              className="size-4 shrink-0 text-primary"
              aria-label="Manually bumped to the front of the queue"
            />
          )}
          {/* A live ticket's status sits in its bottom strip (see
              TicketFooter). A closed ticket has no strip, so its outcome
              stays up here. */}
          {closed && <OrderStatusBadge status={status} />}
        </div>
        {/* Wrapped, not truncated: this name is what staff write on the cup
            and call out, so a cut-off one is a mix-up waiting to happen. A
            walk-up has no phone to notify, so staff need to know to call
            it. */}
        <p className="mt-1.5 text-base leading-snug font-medium break-words">
          {order.customer_name}
          {showsWalkupTag(order) && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · walk-up
            </span>
          )}
        </p>
      </div>
      <TicketMenu
        number={number}
        disabled={menuDisabled}
        onBump={onBump}
        onCancel={onCancel}
      />
    </div>
  );
}
