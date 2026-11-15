# landing/journey

## Purpose

The part of the landing page below the hero: one order followed from the
customer's phone to the vendor's board, then a closing call. Structure and
behaviour sit apart from qkit's look (semantic Tailwind classes only) so the
generic pieces can move into `@merqo/ui` later.

## Contents

- `journey.tsx` — `Journey` (section with heading) and `JourneyStep` (label, heading, text beside a stage). Server components.
- `phone-frame.tsx` — `PhoneFrame`, the outline for anything shown on a customer's phone.
- `press-button.tsx` — `PressButton`: darken on hover, one pressed state that works by touch, one focus ring, no lift or glow.
- `faq-rows.tsx` — `FaqRows`, ruled native `details` rows.
- `closing-call.tsx` — `ClosingCall`, the closing block with a heading, a line, an action and an aside.
- `use-scroll-play.ts` — `useScrollPlay(ref, steps)`: scroll position to a step from 0 to `steps` (passive scroll listener, one `requestAnimationFrame` per frame, cleaned up on unmount), plus `usePrefersReducedMotion`, `scrollProgress` and `progressToStep`. Pass the element that shows the result (the stage), not the section with copy above it. Play starts when a third of that element is visible and ends halfway between fully visible and top-of-viewport, so the last step lands while it is on screen. Returns the finished step for server render, reduced motion and an element meaningfully on screen at mount (a third visible or more); that element stays finished until it has left below the viewport, so nothing visible snaps back after hydration. An element below the viewport, or peeking in by less than a third, drops to its measured step at once and plays on scroll.
- `order-watch.tsx` — `OrderWatch`, step 1: the order builds on a phone as the stage scrolls into view.
- `mark-ready-demo.tsx` — `MarkReadyDemo`, step 2: Mark Ready stamps the ticket and the customer's phone reacts. The helper text reserves the height of its longest line, so pressing Mark Ready or Reset never moves the ticket. The print and stamp animations are skipped under reduced motion.
- `*.test.tsx` — touch and keyboard operation, reduced-motion rendering, scroll mapping, FAQ row count.
