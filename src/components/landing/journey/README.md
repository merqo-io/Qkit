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
- `use-scroll-play.ts` — `useScrollPlay(ref, steps)`: scroll position to a step from 0 to `steps` (passive scroll listener, one `requestAnimationFrame` per frame, cleaned up on unmount), plus `usePrefersReducedMotion`, `scrollProgress` and `progressToStep`. Pass the element that shows the result (the stage), not the section with copy above it. Play starts when a third of that element is visible and ends halfway between fully visible and top-of-viewport, so the last step lands while it is on screen. With JS and no reduced-motion preference the measured step always applies, once at mount and then on every scroll and resize, wherever the page loads. Server render, no-JS and reduced motion return the finished step; the mount measurement replaces it right after hydration.
- `pinned-progress.ts` — `pinnedProgress`, pure maths: how far a sticky panel inside a tall track has played, 0 to 1 (0 before the pin, 1 after the release or when the track has no scroll distance).
- `use-pinned-play.ts` — `usePinnedPlay(track, panel, steps)`: the step from `pinnedProgress` (passive scroll and resize, one `requestAnimationFrame` per frame, measured at mount), plus whether a pin is wanted and the panel height. Reduced motion, server render and no-JS get the finished step and no pin.
- `order-watch.tsx` — `OrderWatch`, step 1: the step is held by `position: sticky` under the nav inside a `200svh` spacer track while scroll plays menu, add, options, cart and ORDER PLACED (40svh each, the last held before release); scrolling up rewinds. If the panel is taller than the viewport (short phones) its `top` goes negative so the stage stays fully on screen and the copy scrolls off first. No scroll hijacking and no ancestor `overflow` is needed. Reduced motion has no track and shows the finished order.
- `mark-ready-demo.tsx` — `MarkReadyDemo`, step 2: Mark Ready stamps the ticket and the customer's phone reacts. Nothing resizes or moves on any tap: the helper text reserves the height of its longest line, and the ticket stays mounted but `invisible`, `inert` and `aria-hidden` in the last stage, sharing one grid cell with the "All caught up" box so the card keeps the ticket's height. The phone frame is fixed size and the button is full width. The print and stamp animations are skipped under reduced motion.
- `*.test.tsx` — touch and keyboard operation, reduced-motion rendering, scroll mapping, FAQ row count.
