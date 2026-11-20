# landing/journey

## Purpose

The "How it works" story below the hero: one order, two screens. The visitor
follows order 0042 across the customer's phone and the vendor's tablet, both
driven by one reducer. Client state only: no network, server actions or
database.

## Contents

- `try-it.tsx` - `TryIt`, called with no props. Renders `<section id="how">` with the heading, the steps column, the stepper (below 960px), the screen tabs, the two devices, "Play it again" and the single `aria-live` region. Owns the reducer, the 10 second auto-clear timer, the scroll-to-step picker (a step is active once its top passes the middle of the screen) and the tap auto-scroll, which is clamped so the sticky devices stay pinned on the last step while still scrolling far enough for step 3 to pass the middle line.
- `try-it-state.ts` - the pure reducer and helpers: `STEP_OF` (stage to step), `CANON` (step to stage), `focusOf`, `cuedScreen`, `tabSubtitle`, `tabFlashes`, `stepAfter`, `announcement`. Start jumps to step 3; "2 Start" with the phone showing switches to the board; an act never switches screens on a phone.
- `story-phone.tsx` - the customer's phone: a working menu, then the real status page parts (`StageTrack`, `WaitEstimate`, `statusCopy`) for order 0042.
- `story-board.tsx` - the vendor's tablet: tickets from the real `Ticket`, `TicketItems` and `TicketFooter`. Landscape with two columns from 960px, portrait with one column below. "Mark Picked Up" shows a draining 10 second countdown labelled as a sample, since the vendor sets the real delay.
- `story-cue.tsx` - `Cue`, a pulsing ring around the next button to tap.
- `story-steps.ts` - the three step texts.
- `use-story-layout.ts` - `useWide` (960px media query, false on the server) and `useFitScale`, which shrinks the fixed-size devices with CSS `zoom` to fit the column and the viewport height.
- `*.test.ts(x)` - reducer tests and a DOM test for the tabs, the "Tap to continue" cue, the single live region and the reduced-motion finished state.

Below 960px one device shows at a time. The hidden one's tab flashes "Tap to continue" when the next action is on it. The outgoing screen hides at once and the incoming one fades in. With reduced motion the story starts in its finished state with no animation.
