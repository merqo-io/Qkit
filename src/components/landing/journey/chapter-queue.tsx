import { cn } from "@merqo/ui/primitives";

import { splitTrailingDigit } from "@/lib/orders";

import { Caption } from "./caption";
import { JourneyStep } from "./journey";
import { PhoneFrame } from "./phone-frame";
import { ORDER_NUMBER, PHONE_STATUS, type Phase } from "./try-it-state";

const CAPTION = [
  "Nothing is waiting yet.",
  "The number sits under Preparing.",
  "It moved to Ready. The customer’s phone just told them.",
  "Picked up. The screen clears itself.",
] as const;

const CAPTION_INDEX: Record<Phase, number> = {
  none: 0,
  preparing: 1,
  ready: 2,
  done: 3,
};

/**
 * Mirrors the real queue screen (`order/[boothId]/display/queue-display.tsx`),
 * which polls, plays sound and calls server actions, so it cannot be imported.
 * Tile classes follow the real ones, minus the drop shadow the site avoids and
 * the tilt, which the real screen applies only during the brief stamp entrance.
 */
function NumberTile({ tone }: { tone: "preparing" | "ready" }) {
  const { lead, last } = splitTrailingDigit(ORDER_NUMBER);
  return (
    <span
      className={cn(
        "inline-flex min-h-11 items-center rounded-2xl px-3 font-mono text-xl font-bold",
        tone === "preparing"
          ? "border border-border bg-card"
          : "border-[3px] border-primary bg-primary text-primary-foreground",
      )}
    >
      #{lead}
      <span className="underline decoration-4 underline-offset-4">{last}</span>
    </span>
  );
}

/**
 * Chapter 3: both screens that react to the visitor's two taps. A pure display
 * of the shared phase.
 */
export function ChapterQueue({ phase }: { phase: Phase }) {
  return (
    <JourneyStep
      label="Tap 3 · Nobody shouts"
      heading="The number calls itself."
      say="The queue screen and the customer's phone follow the same two taps. No one calls out a number."
      extra={<Caption lines={CAPTION} index={CAPTION_INDEX[phase]} />}
      stage={
        <>
          <div
            role="group"
            aria-label="Queue screen"
            className="min-w-0 max-w-[300px] flex-[1_1_230px] rounded-lg border border-border bg-card p-3.5"
          >
            <strong className="font-display text-[17px] font-semibold">
              Kopitiam Cart
            </strong>
            <div className="perforation my-3" />
            <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Preparing
            </p>
            <div className="mt-2 flex min-h-14 items-center">
              {phase === "preparing" ? <NumberTile tone="preparing" /> : null}
            </div>
            <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-primary">
              Ready for pickup
            </p>
            <div className="mt-2 flex min-h-14 items-center">
              {phase === "ready" ? <NumberTile tone="ready" /> : null}
            </div>
          </div>
          <PhoneFrame
            label="Customer phone"
            size="small"
            className={cn(
              "items-center justify-center gap-2 text-center",
              phase === "ready" && "bg-status-ready/15",
            )}
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              YOUR PHONE
            </span>
            <span
              className={cn(
                "font-mono text-[38px] font-bold leading-none",
                phase === "none" && "invisible",
              )}
            >
              #{ORDER_NUMBER}
            </span>
            <p className="text-[13px] font-semibold">{PHONE_STATUS[phase]}</p>
          </PhoneFrame>
        </>
      }
    />
  );
}
