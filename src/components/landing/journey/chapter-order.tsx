"use client";

import type { Dispatch } from "react";
import { ArrowDown } from "lucide-react";

import { cn } from "@merqo/ui/primitives";

import { JourneyStep, PhoneFrame } from "@merqo/ui";
import {
  MAX_KOPI,
  ORDER_NUMBER,
  PHONE_STATUS,
  SAMPLE_QTY,
  phaseOf,
  type TryItAction,
  type TryItState,
} from "./try-it-state";
import { usePinnedPlay } from "./use-pinned-play";

export const ORDER_WATCH_STEPS = 4;

// Scroll spent playing menu, add, cart and ORDER PLACED (40svh each, the last
// held before release). svh stays steady while a phone toolbar moves. The
// motion-reduce class hides it before hydration for visitors who prefer
// reduced motion, so they never see dead scroll.
const PIN_TRACK_CLASS = "h-[200svh] motion-reduce:hidden";

// A phone narrower than 768px and shorter than 760px cannot hold the whole
// panel (caption, phone, ticks) between the nav and the fold, so the spacing
// tightens and the phone frame shrinks to the space left. The rest of the
// panel is about 270px; the 264px floor still holds every menu row and the
// Place order bar. Below that the hook stops pinning instead.
const PANEL_FIT =
  "[@media(max-height:760px)]:max-md:[&>div]:gap-4 [@media(max-height:760px)]:max-md:[&>div]:pt-2 [@media(max-height:760px)]:max-md:[&>div>div:last-child]:gap-2";
const PHONE_FIT =
  "[@media(max-height:760px)]:max-md:h-[clamp(264px,calc(100svh-270px),400px)]";
const ROW_FIT = "[@media(max-height:760px)]:max-md:py-2";

const TICKS = ["Menu", "Add", "Cart", "Placed"] as const;

const STEP_BUTTON =
  "grid size-11 place-items-center rounded-lg border-[1.5px] border-foreground font-mono text-lg font-bold transition-colors aria-disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * What the phone shows. Scroll drives it only until the visitor taps; once the
 * untouched sample order has moved on (ready or picked up on the board) the
 * phone stays on the placed order so it cannot contradict the other screens
 * when the visitor scrolls back up.
 */
function phoneView(state: TryItState, step: number) {
  if (state.taken) {
    return { qty: state.qty, bar: state.qty, placed: state.stage !== "menu" };
  }
  if (state.stage !== "menu") {
    return { qty: SAMPLE_QTY, bar: SAMPLE_QTY, placed: true };
  }
  return {
    qty: Math.min(step, SAMPLE_QTY),
    bar: step >= 3 ? SAMPLE_QTY : 0,
    placed: step >= 4,
  };
}

/**
 * Chapter 1: the visitor is the customer. Until they tap, scroll position is
 * the play head and the step stays pinned under the nav (plain
 * `position: sticky` inside a tall track, never a scroll hijack); the first
 * tap hands the phone to them and shortens the track.
 */
export function ChapterOrder({
  state,
  dispatch,
}: {
  state: TryItState;
  dispatch: Dispatch<TryItAction>;
}) {
  const {
    track,
    panel,
    spacer,
    step: s,
    pinned,
  } = usePinnedPlay(ORDER_WATCH_STEPS, !state.taken);
  const phase = phaseOf(state);

  const view = phoneView(state, s);
  const on = [true, view.qty > 0, view.bar > 0, view.placed];

  const place = () => {
    if (!state.taken) {
      for (let i = 0; i < view.bar; i++) dispatch({ type: "add" });
    }
    dispatch({ type: "place" });
  };

  return (
    <div ref={track}>
      <noscript>
        <style>{"[data-pin-track]{display:none}"}</style>
      </noscript>
      <div
        ref={panel}
        data-pinned={pinned ? "" : undefined}
        className={cn(
          "[&>div]:mt-0 [&>div]:border-t-0",
          pinned && "sticky motion-reduce:static",
          PANEL_FIT,
        )}
      >
        <JourneyStep
          label="Tap 1 · Be the customer"
          heading="Order a kopi."
          say="This is what Ada sees after scanning your QR. Scroll to watch her order, or tap + and place your own."
          stage={
            <>
              <PhoneFrame
                label="Customer menu on a phone"
                className={PHONE_FIT}
              >
                <div
                  inert={view.placed}
                  aria-hidden={view.placed ? true : undefined}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="border-b border-border pb-2.5 font-display text-base font-semibold">
                    Kopitiam Cart
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm font-medium">
                    <div>
                      Kopi
                      <span className="block text-xs font-normal text-muted-foreground">
                        Iced
                      </span>
                    </div>
                    <span className="flex items-center gap-1 font-mono text-sm font-bold">
                      <button
                        type="button"
                        aria-label="Remove one kopi"
                        aria-disabled={view.qty === 0}
                        onClick={() => dispatch({ type: "remove" })}
                        className={cn(
                          STEP_BUTTON,
                          "bg-transparent active:bg-foreground/15",
                        )}
                      >
                        -
                      </button>
                      <span className="min-w-5 text-center">{view.qty}</span>
                      <button
                        type="button"
                        aria-label="Add one kopi"
                        aria-disabled={state.taken && state.qty >= MAX_KOPI}
                        onClick={() => dispatch({ type: "add" })}
                        className={cn(
                          STEP_BUTTON,
                          "bg-foreground text-background active:bg-foreground/70",
                        )}
                      >
                        +
                      </button>
                    </span>
                  </div>
                  {["Teh", "Milo"].map((item) => (
                    <div
                      key={item}
                      className={cn(
                        "flex items-center justify-between border-b border-border py-4 text-sm font-medium text-muted-foreground",
                        ROW_FIT,
                      )}
                    >
                      <span>{item}</span>
                      <span className="font-mono">0</span>
                    </div>
                  ))}
                  <div className="mt-auto h-12">
                    {view.bar > 0 ? (
                      <button
                        type="button"
                        onClick={place}
                        className="flex h-12 w-full items-center justify-between rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background transition-colors active:bg-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <span>
                          {view.bar === 1 ? "1 item" : `${view.bar} items`}
                        </span>
                        <span>Place order</span>
                      </button>
                    ) : (
                      <div className="grid h-12 place-items-center font-mono text-xs text-muted-foreground">
                        Tap + to add a kopi
                      </div>
                    )}
                  </div>
                </div>
                {view.placed ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card p-4 text-center">
                    <span className="font-mono text-xs text-muted-foreground">
                      ORDER PLACED
                    </span>
                    <span className="font-mono text-[40px] font-bold leading-none">
                      #{ORDER_NUMBER}
                    </span>
                    <p className="min-h-10 text-[13px] font-semibold">
                      {PHONE_STATUS[phase]}
                    </p>
                    <p className="flex min-h-5 items-center gap-1 font-mono text-xs text-muted-foreground">
                      {phase === "preparing" ? (
                        <>
                          Scroll down to your stall
                          <ArrowDown className="size-3" aria-hidden />
                        </>
                      ) : null}
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
        <div
          ref={spacer}
          aria-hidden
          data-pin-track
          className={PIN_TRACK_CLASS}
        />
      ) : null}
    </div>
  );
}
