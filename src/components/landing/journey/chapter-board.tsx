"use client";

import { useEffect, useRef, type Dispatch } from "react";

import { cn } from "@merqo/ui/primitives";

import { Ticket } from "@/components/widgets/ticket";
import { ADVANCE } from "@/lib/orders";

import { Caption } from "./caption";
import { JourneyStep } from "./journey";
import { PressButton } from "./press-button";
import {
  ORDER_NUMBER,
  ticketOf,
  type Phase,
  type TryItAction,
  type TryItState,
} from "./try-it-state";
import { usePrefersReducedMotion } from "./use-scroll-play";

const CAPTION = [
  "Place your order above and it lands here.",
  "Tap Mark Ready on the ticket.",
  "Tap Mark Picked Up to clear it.",
  "One order, two taps, done.",
] as const;

const CAPTION_INDEX: Record<Phase, number> = {
  none: 0,
  preparing: 1,
  ready: 2,
  done: 3,
};

/**
 * Product motion only: a ticket prints and a stamp lands. The Web Animations
 * API keeps the keyframes with the component, and nothing runs for visitors
 * who prefer reduced motion.
 */
function animate(el: HTMLElement | null, frames: Keyframe[], duration: number) {
  if (!el || typeof el.animate !== "function") return;
  el.animate(frames, { duration, easing: "cubic-bezier(.2,.7,.2,1)" });
}

const PRINT_FRAMES: Keyframe[] = [
  { clipPath: "inset(0 0 100% 0)", transform: "translateY(-10px)" },
  { clipPath: "inset(0)", transform: "none" },
];

const STAMP_FRAMES: Keyframe[] = [
  { transform: "rotate(-8deg) scale(1.9)", opacity: 0 },
  { transform: "rotate(-8deg) scale(1)", opacity: 1 },
];

/**
 * Chapter 2: the visitor is the stall. The ticket mirrors `LandingTicket`'s
 * layout but hosts live buttons, so it is built here from the same `Ticket`
 * widget. Works by touch, keyboard and with reduced motion; only the print
 * and stamp animations are skipped.
 */
export function ChapterBoard({
  state,
  phase,
  dispatch,
}: {
  state: TryItState;
  phase: Phase;
  dispatch: Dispatch<TryItAction>;
}) {
  const reduced = usePrefersReducedMotion();
  const ticketRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const focusPending = useRef(false);
  const ticket = ticketOf(state);
  const ticketShown = phase === "preparing" || phase === "ready";
  const active = ticketShown ? 1 : 0;
  const advance = ADVANCE[phase === "ready" ? "ready" : "preparing"];

  // Each time the ticket appears (first load, and again after Play again) it
  // prints once when it is at least half in view.
  useEffect(() => {
    const el = ticketRef.current;
    if (!ticketShown || reduced || !el) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        animate(el, PRINT_FRAMES, 550);
        io.disconnect();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ticketShown, reduced]);

  useEffect(() => {
    if (phase === "ready" && !reduced) {
      animate(stampRef.current, STAMP_FRAMES, 280);
    }
  }, [phase, reduced]);

  // The ticket hides after the last stage and returns on reset, so focus is
  // handed to the control that replaces the one just pressed.
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    (phase === "done" ? againRef : advanceRef).current?.focus();
  }, [phase]);

  const onAdvance = () => {
    if (phase === "ready") {
      focusPending.current = true;
      dispatch({ type: "pickedUp" });
    } else {
      dispatch({ type: "ready" });
    }
  };
  const onAgain = () => {
    focusPending.current = true;
    dispatch({ type: "reset" });
  };

  return (
    <JourneyStep
      label="Tap 2 · Be the stall"
      heading="It is already on your board."
      say="This is the real ticket layout your stall sees. Go on, mark it ready."
      extra={<Caption lines={CAPTION} index={CAPTION_INDEX[phase]} />}
      stage={
        <div className="min-w-0 max-w-[300px] flex-[1_1_230px] rounded-lg border border-border bg-card p-3.5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <strong className="font-display text-[17px] font-semibold">
              Kopitiam Cart
            </strong>
            <span className="font-mono text-xs text-muted-foreground">
              {active} active
            </span>
          </div>
          <div className="grid">
            <div
              ref={ticketRef}
              aria-hidden={ticketShown ? undefined : true}
              inert={!ticketShown}
              className={cn(
                "col-start-1 row-start-1",
                !ticketShown && "invisible",
              )}
            >
              <Ticket
                shadow="none"
                radius="xl"
                className="bg-background px-3 pb-4 pt-4"
              >
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-mono text-[26px] font-bold leading-none">
                      #{ORDER_NUMBER}
                    </div>
                    <div className="mt-1.5 text-sm font-semibold">
                      {ticket.name}
                    </div>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-status-aging">
                    4m
                  </span>
                </div>
                <div className="mt-2.5 border-l-4 border-status-payment-claimed bg-status-payment-claimed/15 px-2 py-1.5 text-xs font-semibold">
                  Says paid. Check the payment
                </div>
                {phase === "ready" ? (
                  <span
                    ref={stampRef}
                    className="absolute right-2.5 top-9 -rotate-[8deg] rounded-[3px] border-2 border-status-ready px-2 py-1 font-mono text-[13px] font-bold leading-none tracking-[0.14em] text-status-ready"
                  >
                    READY
                  </span>
                ) : null}
                <div className="my-2.5 border-t-[1.5px] border-dashed border-border" />
                <div className="text-[13px] font-medium">
                  <b className="font-mono">{ticket.qty}×</b> Kopi
                </div>
                <div className="pl-[22px] text-xs text-muted-foreground">
                  Iced
                </div>
                <PressButton
                  ref={advanceRef}
                  className="mt-3"
                  onClick={onAdvance}
                >
                  {advance?.label}
                </PressButton>
              </Ticket>
            </div>
            {ticketShown ? null : (
              <div className="col-start-1 row-start-1 flex flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed border-border px-2 text-center font-mono text-[13px] text-muted-foreground">
                {phase === "done" ? (
                  <>
                    All caught up.
                    <button
                      ref={againRef}
                      type="button"
                      onClick={onAgain}
                      className="mt-2 min-h-11 px-2 font-sans text-sm font-semibold text-foreground underline underline-offset-[3px] hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Play again
                    </button>
                  </>
                ) : (
                  "No orders yet."
                )}
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}
