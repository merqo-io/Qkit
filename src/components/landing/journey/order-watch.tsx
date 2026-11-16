"use client";

import { useRef } from "react";

import { cn } from "@merqo/ui/primitives";

import { JourneyStep } from "./journey";
import { PhoneFrame } from "./phone-frame";
import { usePinnedPlay } from "./use-pinned-play";

export const ORDER_WATCH_STEPS = 4;

// Scroll spent playing the five states (menu to placed), so each state and the
// held ORDER PLACED get 40svh. svh stays steady while a phone toolbar moves.
const PIN_TRACK_CLASS = "h-[200svh] motion-reduce:hidden";

const MENU = ["Kopi", "Teh", "Milo"] as const;
const KOPI_OPTION = "Iced";

const TICKS = ["Menu", "Add", "Cart", "Placed"] as const;

function Stepper({ qty }: { qty: number }) {
  const box =
    "grid size-7 place-items-center rounded-lg border-[1.5px] border-foreground";
  return (
    <span className="flex items-center gap-2 font-mono text-sm font-bold">
      <i aria-hidden className={cn(box, "not-italic")}>
        -
      </i>
      <span>{qty}</span>
      <i aria-hidden className={cn(box, "not-italic")}>
        +
      </i>
    </span>
  );
}

/**
 * Step 1: the customer's order builds on a phone while the step stays pinned
 * under the nav, and rewinds when the visitor scrolls back up. Scroll position
 * is the play head and the pin is plain `position: sticky` inside a tall
 * track, so scrolling is never hijacked. Reduced motion, server render and
 * no-JS show the finished order with no track.
 */
export function OrderWatch() {
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    step: s,
    pinned,
    panelHeight,
  } = usePinnedPlay(trackRef, panelRef, ORDER_WATCH_STEPS);
  const kopiQty = Math.min(s, 2);
  const on = [true, s >= 1, s >= 3, s >= 4];

  return (
    <div ref={trackRef}>
      <div
        ref={panelRef}
        data-pinned={pinned ? "" : undefined}
        className={pinned ? "sticky motion-reduce:static" : undefined}
        style={
          pinned
            ? { top: `min(5rem, calc(100svh - ${panelHeight}px))` }
            : undefined
        }
      >
        <JourneyStep
          label="Step 1 · Watch"
          heading="Ada orders while she is still in the queue."
          say="She scans the QR at your stall. No app, no sign-up. Scroll and her order builds itself."
          stage={
            <>
              <PhoneFrame label="Customer menu on a phone">
                <div className="border-b border-border pb-2.5 font-display text-base font-semibold">
                  Kopitiam Cart
                </div>
                {MENU.map((item, i) => (
                  <div
                    key={item}
                    className="flex items-center justify-between gap-2 border-b border-border py-2.5 text-sm font-medium"
                  >
                    <div>
                      {item}
                      {i === 0 && s >= 2 ? (
                        <span className="mt-1 block w-fit rounded-full border border-foreground px-2 py-0.5 text-[11px] font-semibold">
                          {KOPI_OPTION}
                        </span>
                      ) : null}
                    </div>
                    <Stepper qty={i === 0 ? kopiQty : 0} />
                  </div>
                ))}
                {s >= 3 ? (
                  <div className="mt-auto flex justify-between rounded-lg bg-foreground px-3 py-2.5 text-[13px] font-semibold text-background">
                    <span>2 items</span>
                    <span>Place order</span>
                  </div>
                ) : (
                  <div className="mt-auto py-2.5 text-center font-mono text-xs text-muted-foreground">
                    Nothing in the cart yet
                  </div>
                )}
                {s >= 4 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-card p-4 text-center">
                    <span className="font-mono text-xs text-muted-foreground">
                      ORDER PLACED
                    </span>
                    <span className="font-mono text-[40px] font-bold leading-none">
                      #0042
                    </span>
                    <p className="text-[13px]">
                      We will call you when it is ready.
                    </p>
                  </div>
                ) : null}
              </PhoneFrame>
              <ul
                aria-hidden
                className="flex flex-row flex-wrap justify-center gap-x-3.5 gap-y-2.5 self-center font-mono text-xs text-muted-foreground md:flex-col md:gap-3.5"
              >
                {TICKS.map((t, i) => (
                  <li
                    key={t}
                    className={cn(
                      "flex items-center gap-2",
                      on[i] && "font-bold text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-[9px] rounded-full border-[1.5px]",
                        on[i]
                          ? "border-foreground bg-foreground"
                          : "border-muted-foreground",
                      )}
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </>
          }
        />
      </div>
      {pinned ? (
        <div aria-hidden data-pin-track className={PIN_TRACK_CLASS} />
      ) : null}
    </div>
  );
}
