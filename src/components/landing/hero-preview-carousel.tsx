"use client";

import { usePrefersReducedMotion } from "@merqo/ui";
import { cn } from "@merqo/ui/primitives";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANDING_BOARDS } from "@/components/landing/landing-boards";
import { SampleTicket } from "@/components/landing/sample-ticket";
import { Ticket } from "@/components/widgets/ticket";
import { nearestIndex } from "@/lib/carousel";

const ROTATE_MS = 7000;
const WHEEL_BURST_MS = 150;
const COUNT = LANDING_BOARDS.length;

/**
 * The hero's sample boards: native scroll-snap for fingers and trackpads, mouse
 * click-drag on top, and one countdown that moves to the next board. Any touch
 * of the carousel restarts the whole countdown, so a visitor reading a board is
 * never moved on a moment later; one burst of wheel events counts as one
 * touch. Reduced motion has no auto-advance.
 */
export function HeroPreviewCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const index = useRef(0);
  const paused = useRef(false);
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  const wheelBurst = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [epoch, setEpoch] = useState(0);

  const restart = useCallback(() => setEpoch((e) => e + 1), []);

  const show = useCallback((i: number) => {
    const el = trackRef.current;
    index.current = i;
    setActive(i);
    el?.scrollTo?.({
      left: i * el.clientWidth,
      behavior: reducedRef.current ? "auto" : "smooth",
    });
  }, []);

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => {
      if (!paused.current && !document.hidden)
        show((index.current + 1) % COUNT);
      restart();
    }, ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [epoch, reduced, restart, show]);

  useEffect(
    () => () => {
      if (wheelBurst.current !== null) window.clearTimeout(wheelBurst.current);
    },
    [],
  );

  const onWheel = useCallback(() => {
    const burst = wheelBurst.current;
    if (burst !== null) window.clearTimeout(burst);
    else restart();
    wheelBurst.current = window.setTimeout(() => {
      wheelBurst.current = null;
    }, WHEEL_BURST_MS);
  }, [restart]);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const i = nearestIndex(el.scrollLeft, el.clientWidth, COUNT);
    index.current = i;
    setActive(i);
  }, []);

  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (e.pointerType !== "mouse" || e.button !== 0 || !el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    const d = drag.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) {
      d.moved = true;
      el.dataset.drag = "";
    }
    el.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const el = trackRef.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d) return;
    delete el.dataset.drag;
    if (!d.moved) return;
    const w = el.clientWidth;
    const delta = el.scrollLeft - d.left;
    const flicked = Math.abs(delta) > w * 0.15;
    const step = flicked ? Math.sign(delta) : 0;
    show(Math.min(COUNT - 1, Math.max(0, Math.round(d.left / w) + step)));
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Sample order boards"
      className="min-w-0"
      onPointerDown={restart}
      onTouchStart={restart}
      onTouchEnd={restart}
      onWheel={onWheel}
      onKeyDown={restart}
      onClick={restart}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <Ticket
        radius="xl"
        shadow="none"
        className="flex h-full min-h-[420px] w-full min-w-0 flex-col bg-card"
      >
        <div
          ref={trackRef}
          data-testid="hero-track"
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex flex-1 cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] data-[drag]:cursor-grabbing data-[drag]:snap-none data-[drag]:select-none [&::-webkit-scrollbar]:hidden"
        >
          {LANDING_BOARDS.map((board, i) => (
            <div
              key={board.key}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${COUNT}`}
              className="flex min-w-0 flex-[0_0_100%] snap-start flex-col justify-center px-4 pt-6 pb-1 sm:px-5"
            >
              <div className="mb-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Sample orders
                  </p>
                  <p className="font-display mt-0.5 truncate text-[0.95rem] font-semibold">
                    {board.title}
                  </p>
                </div>
                <p className="text-xs font-bold whitespace-nowrap text-primary">
                  {board.orders.filter((o) => o.status !== "completed").length}{" "}
                  active
                </p>
              </div>
              <div className="grid items-stretch gap-2.5 sm:grid-cols-2 sm:gap-3">
                {board.orders.map((order) => (
                  <SampleTicket key={order.number} order={order} />
                ))}
              </div>
              <p className="mt-3 min-h-6 text-[0.8125rem] text-muted-foreground">
                <b className="font-semibold text-foreground">{board.lead}</b>{" "}
                {board.caption}
              </p>
            </div>
          ))}
        </div>

        <div className="flex justify-center px-2 pb-1">
          {LANDING_BOARDS.map((board, i) => (
            <button
              key={board.key}
              type="button"
              aria-label={`Show sample ${i + 1}: ${board.lead.replace(/\.$/, "")}`}
              aria-current={i === active}
              onClick={() => show(i)}
              className="group grid size-11 cursor-pointer place-items-center rounded-lg"
            >
              <span
                className={cn(
                  "h-2 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none",
                  i === active
                    ? "w-[22px] bg-foreground"
                    : "w-2 bg-border group-hover:bg-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
      </Ticket>
    </div>
  );
}
