"use client";

import { Check } from "lucide-react";

import { cn } from "@merqo/ui/primitives";

import {
  StageTrack,
  WaitEstimate,
} from "@/app/order/[boothId]/[orderNumber]/order-status-parts";
import { statusCopy } from "@/app/order/[boothId]/[orderNumber]/order-status-copy";
import { formatPrice } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";
import { Cue } from "./story-cue";
import {
  MENU,
  itemCount,
  totalCents,
  type MenuKey,
  type StoryState,
} from "./try-it-state";

const STATUS_OF_STAGE: Record<number, OrderStatus> = {
  1: "pending",
  2: "preparing",
  3: "ready",
  4: "completed",
};

const WAIT_SECONDS: Record<number, number> = { 1: 300, 2: 180 };

const STEP_BUTTON =
  "relative grid size-11 place-items-center rounded-lg border border-border bg-card text-base font-bold active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Menu({
  state,
  onQty,
  onPlace,
}: {
  state: StoryState;
  onQty: (key: MenuKey, delta: 1 | -1) => void;
  onPlace: () => void;
}) {
  const count = itemCount(state);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="font-display text-xl font-semibold">Kopitiam Cart</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-status-ready"
        />
        Open now · Stall 14
      </p>
      <ul className="mt-2 divide-y divide-border">
        {MENU.map((m) => {
          const qty = state.qty[m.key];
          return (
            <li
              key={m.key}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-sm leading-tight font-semibold">
                  {m.name}
                  {m.option && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {m.option}
                    </span>
                  )}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatPrice(m.cents)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {qty > 0 && (
                  <>
                    <button
                      type="button"
                      className={STEP_BUTTON}
                      aria-label={`One less ${m.name}`}
                      onClick={(e) => {
                        const row = e.currentTarget.closest("li");
                        onQty(m.key, -1);
                        if (qty === 1) {
                          row
                            ?.querySelector<HTMLElement>("[data-plus]")
                            ?.focus();
                        }
                      }}
                    >
                      −
                    </button>
                    <b className="min-w-4 text-center font-mono text-sm">
                      {qty}
                    </b>
                  </>
                )}
                <button
                  type="button"
                  data-plus=""
                  className={cn(
                    STEP_BUTTON,
                    "border-primary bg-primary text-primary-foreground",
                  )}
                  aria-label={`One more ${m.name}`}
                  onClick={() => onQty(m.key, 1)}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Cue active={count > 0} tone="foreground" className="mt-auto">
        <button
          type="button"
          disabled={count === 0}
          onClick={onPlace}
          className="flex h-12 w-full items-center justify-between rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            {count} item{count === 1 ? "" : "s"} ·{" "}
            {formatPrice(totalCents(state))}
          </span>
          <span>Place order</span>
        </button>
      </Cue>
    </div>
  );
}

function Status({ state }: { state: StoryState }) {
  const status = STATUS_OF_STAGE[state.stage];
  const copy = statusCopy(status, {
    needsArrival: false,
    awaitingPayment: false,
    paymentSent: false,
  });
  const ready = status === "ready";
  const seconds = WAIT_SECONDS[state.stage];
  const chosen = MENU.filter((m) => state.qty[m.key] > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 text-center">
      <header>
        <p
          className={cn(
            "font-mono text-5xl leading-none font-bold tracking-tight",
            status === "completed" &&
              "text-muted-foreground line-through decoration-muted-foreground/70 decoration-2",
          )}
        >
          #0042
        </p>
        <p className="mt-1.5 text-base font-medium">Priya</p>
        <p className="text-xs text-muted-foreground">Kopitiam Cart</p>
      </header>
      <div className="perforation" />
      <StageTrack status={status} />
      <div
        className={cn(
          "space-y-1",
          ready &&
            "rounded-2xl border-2 border-status-ready bg-status-ready/10 px-3 py-2.5",
        )}
      >
        <p
          className={cn(
            "font-display font-semibold text-balance",
            ready ? "text-2xl text-status-ready" : "text-xl",
          )}
        >
          {copy.headline}
        </p>
        <p
          className={cn(
            "text-xs text-balance",
            ready ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {copy.detail}
        </p>
      </div>
      {seconds !== undefined && (
        <WaitEstimate wait={{ seconds, ordersAhead: 2 }} />
      )}
      <div className="perforation" />
      <ul className="space-y-1 text-left text-xs">
        {chosen.map((m) => (
          <li key={m.key} className="flex justify-between gap-2">
            <span className="min-w-0 break-words">
              <span className="font-mono text-muted-foreground">
                {state.qty[m.key]}×
              </span>{" "}
              {m.name}
              {m.option ? ` (${m.option})` : ""}
            </span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {formatPrice(state.qty[m.key] * m.cents)}
            </span>
          </li>
        ))}
      </ul>
      {state.stage === 4 && (
        <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Check className="size-3.5" aria-hidden="true" />
          You can close this page.
        </p>
      )}
    </div>
  );
}

/** The customer's phone: the menu before the order, then the real status page. */
export function StoryPhone({
  state,
  onQty,
  onPlace,
}: {
  state: StoryState;
  onQty: (key: MenuKey, delta: 1 | -1) => void;
  onPlace: () => void;
}) {
  return state.stage === 0 ? (
    <Menu state={state} onQty={onQty} onPlace={onPlace} />
  ) : (
    <Status state={state} />
  );
}
