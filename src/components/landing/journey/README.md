# landing/journey

## Purpose

The part of the landing page below the hero: one order followed from the
customer's phone to the vendor's board, then a closing call. The generic pieces
(`Journey`, `JourneyStep`, `PhoneFrame`, `PressButton`, `FaqRows`, `ClosingCall`,
`useScrollPlay`, `usePrefersReducedMotion`) come from `@merqo/ui`; only the two
demos that use qkit's own ticket widget live here.

## Contents

- `order-watch.tsx` — `OrderWatch`, step 1: the order builds on a phone as the stage scrolls into view.
- `mark-ready-demo.tsx` — `MarkReadyDemo`, step 2: Mark Ready stamps the ticket and the customer's phone reacts. The helper text reserves the height of its longest line, so pressing Mark Ready or Reset never moves the ticket. The print and stamp animations are skipped under reduced motion.
- `*.test.tsx` — touch and keyboard operation, reduced-motion rendering, the Mark Ready flow.
