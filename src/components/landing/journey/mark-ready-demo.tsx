"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@merqo/ui/primitives";

import { Ticket } from "@/components/widgets/ticket";

import { JourneyStep } from "./journey";
import { PhoneFrame } from "./phone-frame";
import { PressButton } from "./press-button";
import { usePrefersReducedMotion } from "./use-scroll-play";

type Stage = 0 | 1 | 2;

const PHONE_TEXT = [
  "Preparing your order",
  "Ready. Collect at the counter.",
  "Picked up. Enjoy your kopi.",
] as const;

const CAPTION = [
  "Tap Mark Ready on the ticket.",
  "Ada’s phone just told her. Nobody shouted a number.",
  "One order, two taps, done.",
] as const;

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
 * Step 2: the visitor does the vendor's job. Pressing Mark Ready stamps the
 * ticket and the customer's phone reacts. Works by touch, keyboard and with
 * reduced motion; only the print and stamp animations are skipped.
 */
export function MarkReadyDemo() {
  const [stage, setStage] = useState<Stage>(0);
  const reduced = usePrefersReducedMotion();
  const ticketRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const focusPending = useRef(false);
  const ticketShown = stage < 2;

  // One print path: each time the ticket mounts (first load, and again after
  // Play again) it prints once when it is at least half in view.
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
    if (stage === 1 && !reduced) animate(stampRef.current, STAMP_FRAMES, 280);
  }, [stage, reduced]);

  // The ticket subtree unmounts after the last stage and remounts on reset,
  // so focus is handed to the control that replaces the one just pressed.
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    (stage === 2 ? againRef : advanceRef).current?.focus();
  }, [stage]);

  const advance = () => {
    if (stage === 1) focusPending.current = true;
    setStage((s) => (s === 0 ? 1 : 2));
  };
  const again = () => {
    focusPending.current = true;
    setStage(0);
  };

  return (
    <JourneyStep
      label="Step 2 · Tap"
      heading="It prints onto your board. You tap once."
      say="This is the real ticket layout your stall sees. Go on, mark it ready."
      extra={
        <p
          aria-live="polite"
          className="mt-4 min-h-[3em] max-w-[34ch] font-semibold"
        >
          {CAPTION[stage]}
        </p>
      }
      stage={
        <>
          <div className="min-w-0 max-w-[300px] flex-[1_1_230px] rounded-lg border border-border bg-card p-3.5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <strong className="font-display text-[17px] font-semibold">
                Kopitiam Cart
              </strong>
              <span className="font-mono text-xs text-muted-foreground">
                {stage === 2 ? "0 active" : "1 active"}
              </span>
            </div>
            {stage < 2 ? (
              <div ref={ticketRef}>
                <Ticket
                  shadow="none"
                  radius="xl"
                  className="bg-background px-3 pb-4 pt-4"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-mono text-[26px] font-bold leading-none">
                        #0042
                      </div>
                      <div className="mt-1.5 text-sm font-semibold">Ada</div>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-status-aging">
                      4m
                    </span>
                  </div>
                  <div className="mt-2.5 border-l-4 border-status-payment-claimed bg-status-payment-claimed/15 px-2 py-1.5 text-xs font-semibold">
                    Says paid. Check the payment
                  </div>
                  {stage === 1 ? (
                    <span
                      ref={stampRef}
                      className="absolute right-2.5 top-9 -rotate-[8deg] rounded-[3px] border-2 border-status-ready px-2 py-1 font-mono text-[13px] font-bold leading-none tracking-[0.14em] text-status-ready"
                    >
                      READY
                    </span>
                  ) : null}
                  <div className="my-2.5 border-t-[1.5px] border-dashed border-border" />
                  <div className="text-[13px] font-medium">
                    <b className="font-mono">2×</b> Kopi
                  </div>
                  <div className="pl-[22px] text-xs text-muted-foreground">
                    Iced
                  </div>
                  <PressButton
                    ref={advanceRef}
                    className="mt-3"
                    onClick={advance}
                  >
                    {stage === 0 ? "Mark Ready" : "Mark Picked Up"}
                  </PressButton>
                </Ticket>
              </div>
            ) : (
              <div className="rounded-lg border-[1.5px] border-dashed border-border px-2 py-6 text-center font-mono text-[13px] text-muted-foreground">
                All caught up.
                <br />
                <button
                  ref={againRef}
                  type="button"
                  onClick={again}
                  className="mt-2 min-h-11 px-2 font-sans text-sm font-semibold text-foreground underline underline-offset-[3px] hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Play again
                </button>
              </div>
            )}
          </div>
          <PhoneFrame
            label="Ada's phone"
            size="small"
            className={cn(
              "items-center justify-center gap-2 text-center",
              stage === 1 && "bg-status-ready/15",
            )}
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              ADA&apos;S PHONE
            </span>
            <span className="font-mono text-[38px] font-bold leading-none">
              #0042
            </span>
            <p className="text-[13px] font-semibold">{PHONE_TEXT[stage]}</p>
          </PhoneFrame>
        </>
      }
    />
  );
}
