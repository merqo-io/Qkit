# landing/journey

## Purpose

The part of the landing page below the hero: the visitor plays one order
through three chapters (customer phone, vendor board, queue screen plus the
customer's phone), then a closing call. Client state only: no network, server
actions or database. Structure and
behaviour sit apart from qkit's look (semantic Tailwind classes only) so the
generic pieces can move into `@merqo/ui` later.

## Contents

- `Journey`, `JourneyStep`, `PhoneFrame`, `PressButton`, `FaqRows`, `ClosingCall`, `useScrollPlay`, `usePrefersReducedMotion`, `scrollProgress` and `progressToStep` come from `@merqo/ui`; there are no local copies.
- `pinned-progress.ts` — `pinnedProgress`, pure maths: how far a sticky panel inside a tall track has played, 0 to 1 (0 before the pin, 1 after the release or when the track has no scroll distance), and `pinFits`, whether a panel fits between the pin top and the viewport bottom.
- `use-pinned-play.ts` - `usePinnedPlay(steps, driven)`: owns and returns the `track`, `panel` and `spacer` refs plus the step from `pinnedProgress` (passive scroll, resize and a `ResizeObserver` on the panel, one `requestAnimationFrame` per frame). The sticky `top` is written to the panel in the same measurement that reads it, so progress never lags it. While `driven` is false (the visitor's taps run the phone) the spacer is cut to the distance already scrolled, so nothing jumps and no dead scroll remains; it is restored only when fully off screen, compensating the scroll position if it sits above the viewport with scroll anchoring switched off for that resize so Chrome, Firefox and Safari agree. A takeover at the very top of the track leaves a spacer of about zero height, which moves nothing. The pin top is a fixed 5rem; a panel too tall to fit under it in the shortest viewport (measured with an `svh` probe, so a retracting phone toolbar cannot flip it) is not pinned and shows the finished step. Chapter 1 shrinks its phone frame and spacing under 760px of height on phones so it still fits down to about 530px. Reduced motion returns step 0 and no pin; server render and no-JS return the finished step.
- `try-it-state.ts` - the pure reducer shared by the three chapters (add, remove, place, ready, pickedUp, reset), the `taken` flag (first tap hands the phone from scroll play to the visitor), `phaseOf`, `ticketOf`, phone status strings and the live-region `announcement`.
- `try-it.tsx` - `TryIt`: owns the reducer and the single `aria-live` region and renders the three chapters.
- `chapter-order.tsx` - chapter 1: the customer's phone with working kopi minus and plus, pinned by `position: sticky` inside a `200svh` spacer track until the visitor taps. The spacer is hidden by `motion-reduce:hidden` and a `noscript` rule, so reduced-motion and no-JS visitors never see dead scroll.
- `chapter-order.tsx` also holds "Order again", a secondary button inside the ORDER PLACED overlay (absolutely positioned, so the panel never changes height). It dispatches `replay`: empty menu with the takeover flag kept, so scroll play stays off, the pinned track is not restored or resized, and the board and queue chapters empty too. Focus moves to the + button. `reset` (Play again, chapter 2) still returns to the untouched sample.
- `chapter-board.tsx` - chapter 2: the vendor ticket built from the `Ticket` widget (`LandingTicket` cannot host live buttons) with Mark Ready, Mark Picked Up and Play again from `ADVANCE`. Nothing resizes on a tap: the ticket stays mounted but `invisible` and `inert` in the last stage, sharing one grid cell with the "All caught up" box. Print and stamp animations are skipped under reduced motion.
- `chapter-queue.tsx` - chapter 3: a miniature of the queue screen (mirrors `order/[boothId]/display/queue-display.tsx`, which polls and calls server actions) and the customer's phone.
- `caption.tsx` - a helper line that reserves the height of its longest variant.
- `*.test.ts(x)` - reducer, the full play-through by touch and keyboard, reduced-motion rendering, scroll mapping, FAQ row count.
