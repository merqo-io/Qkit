"use client";

import { MoreHorizontal } from "lucide-react";

import { Button, cn } from "@merqo/ui/primitives";
import { TabletFrame } from "@merqo/ui";

import { TicketFooter } from "@/components/board/order-card-footer";
import { TicketItems } from "@/components/board/order-card-parts";
import { Ticket } from "@/components/widgets/ticket";
import { splitTrailingDigit } from "@/lib/orders";
import type { OrderItem, OrderStatus } from "@/lib/types";
import { Cue } from "./story-cue";
import {
  AUTO_CLEAR_SECONDS,
  MENU,
  type StoryAct,
  type StoryState,
} from "./try-it-state";

type BoardOrder = {
  number: string;
  name: string;
  status: OrderStatus;
  ageMins: number;
  items: OrderItem[];
  action: { label: string; act: StoryAct | null };
};

const SAMPLE_ORDERS: BoardOrder[] = [
  {
    number: "0041",
    name: "Wei",
    status: "preparing",
    ageMins: 3,
    items: [
      {
        menuItemId: "teh",
        name: "Teh",
        quantity: 1,
        options: [{ group: "Sugar", choice: "Less sugar" }],
      },
      { menuItemId: "toast", name: "Kaya Toast", quantity: 1 },
    ],
    action: { label: "Mark Ready", act: null },
  },
  {
    number: "0040",
    name: "Ada",
    status: "ready",
    ageMins: 6,
    items: [
      {
        menuItemId: "milo",
        name: "Milo",
        quantity: 1,
        options: [{ group: "Temperature", choice: "Hot" }],
      },
    ],
    action: { label: "Mark Picked Up", act: null },
  },
];

const ACTION_OF_STAGE: Record<number, { label: string; act: StoryAct }> = {
  1: { label: "Start now", act: "start" },
  2: { label: "Mark Ready", act: "ready" },
  3: { label: "Mark Picked Up", act: "pickup" },
};

const STATUS_OF_STAGE: Record<number, OrderStatus> = {
  1: "pending",
  2: "preparing",
  3: "ready",
};

const AGE_OF_STAGE: Record<number, number> = { 1: 1, 2: 2, 3: 4 };

const ACTION_CLASS =
  "relative h-12 w-full overflow-hidden rounded-lg text-base font-semibold";

function visitorOrder(state: StoryState): BoardOrder | null {
  const action = ACTION_OF_STAGE[state.stage];
  if (!action) return null;
  return {
    number: "0042",
    name: "Priya",
    status: STATUS_OF_STAGE[state.stage],
    ageMins: AGE_OF_STAGE[state.stage],
    items: MENU.filter((m) => state.qty[m.key] > 0).map((m) => ({
      menuItemId: m.key,
      name: m.name,
      quantity: state.qty[m.key],
      options: m.option ? [{ group: m.name, choice: m.option }] : undefined,
    })),
    action,
  };
}

function TicketHead({ number, name }: { number: string; name: string }) {
  const split = splitTrailingDigit(number);
  return (
    <div className="flex items-start gap-3 px-4 pt-5 pb-3">
      <div className="min-w-0 flex-1">
        <h3 className="font-mono text-3xl leading-none font-bold tracking-tight">
          #{split.lead}
          <span className="text-primary">{split.last}</span>
        </h3>
        <p className="mt-1.5 text-base leading-snug font-medium break-words">
          {name}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="-mt-1 -mr-2 grid size-10 place-items-center text-muted-foreground"
      >
        <MoreHorizontal className="size-5" />
      </span>
    </div>
  );
}

function BoardTicket({
  order,
  onAct,
  left,
  landing,
}: {
  order: BoardOrder;
  onAct: (act: StoryAct) => void;
  left: number | null;
  landing: boolean;
}) {
  const live = order.action.act;
  const draining = live === "pickup";
  return (
    <Ticket
      radius="xl"
      shadow="none"
      className={cn(
        "flex w-full flex-col shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_oklch(0.4_0.06_45/0.4)]",
        landing &&
          "animate-in fade-in slide-in-from-top-2 duration-500 motion-reduce:animate-none",
      )}
    >
      <TicketHead number={order.number} name={order.name} />
      <div className="perforation mx-4" />
      <TicketItems items={order.items} showPrices={false} />
      <div className="px-4 pb-4">
        {live ? (
          <Cue active tone="foreground">
            <Button className={ACTION_CLASS} onClick={() => onAct(live)}>
              {draining && (
                <span
                  aria-hidden="true"
                  className="autoclear-bar absolute inset-y-0 left-0 bg-black/10"
                  style={{ animationDuration: `${AUTO_CLEAR_SECONDS}s` }}
                />
              )}
              <span className="relative">
                {order.action.label}
                {draining && left !== null && (
                  <span className="ml-2 font-mono text-sm opacity-80">
                    {left}s
                  </span>
                )}
              </span>
            </Button>
          </Cue>
        ) : (
          <div
            aria-hidden="true"
            className={cn(
              ACTION_CLASS,
              "grid place-items-center bg-primary text-primary-foreground",
            )}
          >
            {order.action.label}
          </div>
        )}
        {draining && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Sample delay. You set the real one.
          </p>
        )}
      </div>
      <TicketFooter
        ageMins={order.ageMins}
        tone="fresh"
        status={order.status}
        awaitingArrival={false}
      />
    </Ticket>
  );
}

/**
 * The vendor's tablet. Landscape holds two columns on a wide page and the
 * tickets are drawn at their real size inside a zoomed layer, so a ticket here
 * is the same markup and proportions as on the board.
 */
export function StoryBoard({
  state,
  onAct,
  left,
  landing,
}: {
  state: StoryState;
  onAct: (act: StoryAct) => void;
  left: number | null;
  landing: boolean;
}) {
  const mine = visitorOrder(state);
  const orders = mine ? [mine, ...SAMPLE_ORDERS] : SAMPLE_ORDERS;
  return (
    <TabletFrame
      label="Your order board on a tablet"
      title="Kopitiam Cart"
      topBarEnd={
        <>
          <span className="flex items-center gap-1.5 font-bold text-status-ready">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-status-ready"
            />
            Open
          </span>
          <span className="font-bold text-primary">{orders.length} active</span>
        </>
      }
      className="h-[520px] w-[380px] min-[960px]:h-[430px] min-[960px]:w-[540px]"
    >
      <div className="grid grid-cols-1 items-start gap-3 p-3 [zoom:0.9] min-[960px]:grid-cols-2 min-[960px]:[zoom:0.7]">
        {orders.map((order) => (
          <BoardTicket
            key={order.number}
            order={order}
            onAct={onAct}
            left={left}
            landing={landing && order.number === "0042"}
          />
        ))}
      </div>
    </TabletFrame>
  );
}
