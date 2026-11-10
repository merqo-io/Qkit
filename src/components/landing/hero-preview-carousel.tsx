"use client";

// Hero visual: a swipeable horizontal carousel of mock "live order" boards so
// visitors see the real product board (pricing, queue-only, payment, rush).
// Native scroll-snap handles finger + trackpad; pointer handlers add mouse
// click-drag; a 10s timer auto-advances but pauses while the visitor interacts.
// Decorative only (aria-hidden). Reduced-motion: no auto-advance, no smooth.

import { cn } from "@merqo/ui/primitives";
import { useCallback, useEffect, useRef, useState } from "react";
import { LandingBoard } from "@/components/landing/landing-board";
import { LANDING_BOARDS } from "@/components/landing/landing-boards";
import { nearestIndex } from "@/lib/carousel";

const ROTATE_MS = 10_000;

export function HeroPreviewCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const timer = useRef<number | null>(null);
  const reduced = useRef(false);

  const scrollToIndex = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({
      left: i * el.clientWidth,
      behavior: reduced.current ? "auto" : "smooth",
    });
  }, []);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (reduced.current) return;
    stopTimer();
    timer.current = window.setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      const cur = nearestIndex(
        el.scrollLeft,
        el.clientWidth,
        LANDING_BOARDS.length,
      );
      scrollToIndex((cur + 1) % LANDING_BOARDS.length);
    }, ROTATE_MS);
  }, [scrollToIndex, stopTimer]);

  useEffect(() => {
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setActive(
      nearestIndex(el.scrollLeft, el.clientWidth, LANDING_BOARDS.length),
    );
  }, []);

  const drag = useRef<{ startX: number; startLeft: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    stopTimer();
    const el = trackRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!drag.current || !el) return;
    el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };
  const endDrag = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (drag.current && el) {
      el.releasePointerCapture?.(e.pointerId);
      scrollToIndex(
        nearestIndex(el.scrollLeft, el.clientWidth, LANDING_BOARDS.length),
      );
    }
    drag.current = null;
    startTimer();
  };

  return (
    // min-w-0 is load-bearing: as a grid/flex child this wrapper defaults to
    // min-width:auto, which would report the scroll track's full 4-board width
    // as its minimum and stretch the whole page wide (horizontal overflow →
    // pinch-zoom on mobile). min-w-0 lets it shrink to the column so the track
    // actually clips and scrolls.
    <div aria-hidden className="w-full min-w-0">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={stopTimer}
        onPointerLeave={startTimer}
        className="flex w-full min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LANDING_BOARDS.map((board) => (
          <div key={board.key} className="w-full shrink-0 snap-center px-0.5">
            <LandingBoard board={board} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-0.5">
        {LANDING_BOARDS.map((board, i) => (
          <button
            key={board.key}
            type="button"
            tabIndex={-1}
            data-dot
            data-active={i === active}
            onClick={() => {
              stopTimer();
              scrollToIndex(i);
              startTimer();
            }}
            // Small dot, generous tap area — a 6px dot is unmissable on desktop
            // but far below a comfortable touch target, so the padded button
            // gives thumbs ~24px to hit without changing the visual.
            className="grid cursor-pointer place-items-center rounded-full p-2"
          >
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors duration-500",
                i === active ? "bg-primary" : "bg-border",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
