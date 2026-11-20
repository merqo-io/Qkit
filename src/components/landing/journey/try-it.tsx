"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PhoneFrame, usePrefersReducedMotion } from "@merqo/ui";
import { Button, cn } from "@merqo/ui/primitives";

import { Cue } from "./story-cue";
import { StoryBoard } from "./story-board";
import { StoryPhone } from "./story-phone";
import { STORY_STEPS } from "./story-steps";
import { useFitScale, useWide } from "./use-story-layout";
import {
  AUTO_CLEAR_SECONDS,
  CLOCKS,
  INITIAL_STATE,
  STEP_OF,
  announcement,
  cuedScreen,
  focusOf,
  storyReducer,
  tabFlashes,
  tabSubtitle,
  stepAfter,
  type Screen,
  type StoryAct,
  type StoryStep,
} from "./try-it-state";

const SCROLL_LOCK_MS = 1000;

const TABS: { screen: Screen; id: string; label: string }[] = [
  { screen: "phone", id: "story-phone", label: "Customer's phone" },
  { screen: "board", id: "story-board", label: "Your board" },
];

function Device({
  id,
  label,
  lit,
  off,
  children,
}: {
  id: string;
  label: string;
  lit: boolean;
  off: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      data-off={off ? "" : undefined}
      data-lit={lit ? "" : undefined}
      className={cn(
        "transition-opacity duration-[400ms] motion-reduce:transition-none max-[959px]:[grid-area:1/1]",
        !lit && "min-[960px]:opacity-40",
        off
          ? "max-[959px]:invisible"
          : "max-[959px]:animate-in max-[959px]:fade-in motion-reduce:animate-none",
      )}
    >
      <p
        className={cn(
          "mb-2.5 text-[11px] font-bold tracking-[0.12em] uppercase transition-colors max-[959px]:hidden",
          lit ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The whole "how it works" section: one order played across the customer's
 * phone and the vendor's tablet, both read from one reducer. Client state
 * only: no network, server actions or database.
 */
export function TryIt() {
  const [state, dispatch] = useReducer(storyReducer, INITIAL_STATE);
  const [left, setLeft] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const wide = useWide();

  const wideRef = useRef(wide);
  const reducedRef = useRef(reduced);
  const colRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const lockUntil = useRef(0);

  useEffect(() => {
    wideRef.current = wide;
    reducedRef.current = reduced;
  }, [wide, reduced]);

  useFitScale(colRef, zoomRef, wide);

  useEffect(() => {
    if (reduced) dispatch({ type: "settle" });
  }, [reduced]);

  const counting = state.stage === 3;
  useEffect(() => {
    if (!counting) return;
    const end = Date.now() + AUTO_CLEAR_SECONDS * 1000;
    const id = setInterval(() => {
      const ms = end - Date.now();
      if (ms <= 0) {
        clearInterval(id);
        dispatch({ type: "autoClear", wide: wideRef.current });
        return;
      }
      setLeft(Math.max(1, Math.ceil(ms / 1000)));
    }, 250);
    return () => {
      clearInterval(id);
      setLeft(null);
    };
  }, [counting]);

  useEffect(() => {
    if (!wide || reduced) return;
    let frame = 0;
    const pick = () => {
      if (Date.now() < lockUntil.current) return;
      const line = window.innerHeight * 0.5;
      let best: StoryStep = 1;
      stepRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top < line) {
          best = (i + 1) as StoryStep;
        }
      });
      dispatch({ type: "scroll", step: best });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pick();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", pick);
    pick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", pick);
      cancelAnimationFrame(frame);
    };
  }, [wide, reduced]);

  /**
   * After a tap on a wide page the next step scrolls into the middle, but
   * never past the point where the sticky pair would be released, so the
   * devices stay on screen through the last step. It still goes far enough
   * for that step's top to pass the middle line, or scrolling back would pick
   * the previous step again.
   */
  const followStep = useCallback((step: StoryStep) => {
    const target = stepRefs.current[step - 1];
    const stage = stageRef.current;
    const column = stage?.parentElement;
    if (!target || !stage || !column) return;
    const r = target.getBoundingClientRect();
    const half = window.innerHeight * 0.5;
    if (r.top <= half && r.bottom >= half) return;
    lockUntil.current = Date.now() + SCROLL_LOCK_MS;
    const pin = parseFloat(getComputedStyle(stage).top) || 0;
    const centred = window.scrollY + r.top + r.height / 2 - half;
    const keepPinned =
      window.scrollY +
      column.getBoundingClientRect().bottom -
      pin -
      stage.offsetHeight;
    const reachLine = window.scrollY + r.top - half + 24;
    window.scrollTo({
      top: Math.max(Math.min(centred, keepPinned), reachLine),
      behavior: reducedRef.current ? "auto" : "smooth",
    });
  }, []);

  const act = (a: StoryAct) => {
    dispatch({ type: "act", act: a, wide });
    if (wide && !reduced) followStep(stepAfter(a));
  };

  const step = STEP_OF[state.stage];
  const focus = focusOf(state);
  const cued = cuedScreen(state);
  const landing = state.stage === 1 && state.prev === 0 && !reduced;

  return (
    <section id="how" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="border-t border-border pt-14 md:pt-20">
          <p className="font-mono text-xs tracking-[0.14em] text-primary uppercase">
            One order, two screens
          </p>
          <h2 className="font-display mt-2.5 text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl">
            What your customer sees. What you see.
          </h2>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Follow order 0042 from the queue to the counter. The screens are
            live: tap the buttons on them.
          </p>
        </div>
      </div>

      <div
        id="story"
        className="mx-auto grid max-w-6xl gap-x-12 px-5 pb-14 md:pb-24 min-[960px]:grid-cols-[minmax(0,0.66fr)_minmax(0,1.34fr)]"
      >
        <div
          role="group"
          aria-label="Steps"
          className="mt-6 grid grid-cols-3 gap-1.5 min-[960px]:hidden"
        >
          {STORY_STEPS.map((s) => (
            <button
              key={s.n}
              type="button"
              aria-current={step === s.n}
              onClick={() => dispatch({ type: "go", step: s.n })}
              className="min-h-11 rounded-lg border border-border bg-card text-sm font-semibold active:bg-accent aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background"
            >
              {s.n} {s.tab}
            </button>
          ))}
        </div>

        <div ref={colRef} className="min-w-0 min-[960px]:order-2">
          <div
            ref={stageRef}
            className="py-5 min-[960px]:sticky min-[960px]:top-[calc(4rem+3vh)]"
          >
            <div
              role="tablist"
              aria-label="Which screen"
              className="mb-3.5 grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1 min-[960px]:hidden"
            >
              {TABS.map((t) => (
                <button
                  key={t.screen}
                  type="button"
                  role="tab"
                  aria-selected={focus === t.screen}
                  aria-controls={t.id}
                  data-cue={cued === t.screen ? "" : undefined}
                  onClick={() => dispatch({ type: "tab", screen: t.screen })}
                  className={cn(
                    "flex min-h-[52px] flex-col items-center justify-center rounded-lg px-1.5 py-1 leading-tight active:bg-accent",
                    focus === t.screen &&
                      "bg-card shadow-[inset_0_0_0_1px_var(--color-border)]",
                    cued === t.screen &&
                      "ring-2 ring-primary ring-inset motion-safe:animate-pulse",
                  )}
                >
                  <span className="text-sm font-bold">{t.label}</span>
                  <span
                    className={cn(
                      "text-[12.5px] text-muted-foreground transition-colors",
                      tabFlashes(state, t.screen) &&
                        "font-semibold text-primary",
                    )}
                  >
                    {tabSubtitle(state, t.screen)}
                  </span>
                </button>
              ))}
            </div>

            <div
              ref={zoomRef}
              className="mx-auto grid w-max justify-items-center min-[960px]:flex min-[960px]:items-end min-[960px]:gap-6"
            >
              <Device
                id="story-phone"
                label="Customer's phone"
                lit={state.stage !== 1 && state.stage !== 2}
                off={focus !== "phone"}
              >
                <PhoneFrame
                  label="Customer's phone"
                  realistic
                  browserBar={{ url: "qkit.merqo.io" }}
                  statusTime={CLOCKS[state.stage]}
                  className="h-[580px] w-[270px]"
                >
                  <StoryPhone
                    state={state}
                    onQty={(key, delta) =>
                      dispatch({ type: "qty", key, delta })
                    }
                    onPlace={() => act("place")}
                  />
                </PhoneFrame>
              </Device>
              <Device
                id="story-board"
                label="Your board"
                lit={state.stage !== 0}
                off={focus !== "board"}
              >
                <StoryBoard
                  state={state}
                  onAct={act}
                  left={left}
                  landing={landing}
                />
              </Device>
            </div>

            <div className="mt-3.5 flex min-h-11 justify-center">
              <Cue active={state.stage === 4} tone="primary">
                <Button
                  type="button"
                  variant="outline"
                  className={cn("h-11", state.stage < 3 && "invisible")}
                  onClick={() => act("replay")}
                >
                  Play it again
                </Button>
              </Cue>
            </div>
            <p aria-live="polite" className="sr-only">
              {announcement(state)}
            </p>
          </div>
        </div>

        <ol className="m-0 list-none p-0 max-[959px]:order-first">
          {STORY_STEPS.map((s, i) => (
            <li
              key={s.n}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              data-on={step === s.n ? "" : undefined}
              className={cn(
                "border-border min-[960px]:flex min-[960px]:min-h-[64vh] min-[960px]:flex-col min-[960px]:justify-center min-[960px]:border-t min-[960px]:py-8 min-[960px]:first:border-t-0",
                step === s.n
                  ? "max-[959px]:block max-[959px]:animate-in max-[959px]:fade-in max-[959px]:pt-4 motion-reduce:animate-none"
                  : "max-[959px]:hidden",
              )}
            >
              <p
                className={cn(
                  "flex items-center gap-2.5 font-mono text-[12.5px] tracking-[0.1em] uppercase transition-colors",
                  step === s.n ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="inline-grid size-[26px] place-items-center rounded-md border-[1.5px] border-current font-bold">
                  {s.n}
                </span>
                {s.who}
              </p>
              <h3
                className={cn(
                  "font-display mt-3.5 text-[clamp(24px,2.6vw,34px)] leading-[1.12] font-semibold text-balance transition-colors",
                  step !== s.n && "text-muted-foreground",
                )}
              >
                {s.heading}
              </h3>
              <p className="mt-3 max-w-[30em] text-[17px] text-muted-foreground">
                {s.body}
              </p>
              <p className="mt-3 max-w-[30em] text-[15px] font-medium">
                <span className="mb-1 block font-mono text-[11.5px] font-bold tracking-[0.1em] text-primary uppercase">
                  Try it
                </span>
                {s.try}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
