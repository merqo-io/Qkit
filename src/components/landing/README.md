# landing

## Purpose

The "QKit" wordmark surfaces and the site chrome shared across the
landing page and `/about`: the sticky top nav and the plain
inline mark used on the login page.

## Contents

- `nav.tsx` — `Nav({ user, signOutAction })` (a client component, so
  the shared account menu gets `next/link` from `AppLinkProvider` in `components/layout/providers.tsx`; `user` is a `NavUser | null`): the sticky top nav,
  shared by the landing page, `/about` and `/faq`. Composes `@merqo/ui`'s
  `LandingNav` shell (sticky positioning, background blur, border, and the
  responsive `end`-slot gap live there) and supplies the wordmark (a plain
  `<a href="/#top">`, since `Link` leaves the old hash in the URL bar on a
  fragment-only jump) and the right-side content. "FAQ" and "About"
  are passed as plain data through the shell's `links` prop (inline from `sm` up,
  inside a burger menu below `sm`). Signed
  in (`user` set) renders `@merqo/ui`'s `LandingAccountNav` (Dashboard link plus
  the account menu with sign out, help via `submitLandingSupport` and feedback
  via `submitFeedback`, categories in `SUPPORT_CATEGORY_LABELS`); signed out shows "Sign in" and
  "Get started".
- Tap targets: every nav control is at least 44x44px below `sm` (the signed-out links via
  `h-11 min-w-11`; the Dashboard link and avatar trigger inside
  `LandingAccountNav` carry their own 44px sizing) and keeps the 32px look from `sm` up; the shell's burger menu sizes FAQ and About itself.
- `nav.dom.test.tsx` — signed out has no account menu, signed in has
  Dashboard plus a menu opened by touch whose Sign out calls the action, and FAQ and About
  share the same styling classes.
- `nav.test.tsx` — asserts the About/FAQ/Sign-in/Get-started/Dashboard
  link targets, and that the FAQ link (`/faq`) is not
  hidden below `sm`, while the signed-out "Sign in" link is hidden below `sm`
  to keep the row on one line at 320px (the login page has its own
  sign-in switch).
- `wordmark.tsx` — `Wordmark({ size?, className? })`: thin wrapper over
  `@merqo/ui`'s `Wordmark` shell that supplies the "qkit" letters and the
  `text-primary` accent on the q. Used by the login page's two panels (`lg`
  and `xl`) and the MFA page (`lg`), where the nav shell doesn't apply.
- `wordmark.test.tsx` — asserts the text, the accent class and the size class.
- `hero-preview-carousel.tsx` — `HeroPreviewCarousel()`: the hero's sample-board carousel over `LANDING_BOARDS`. Native scroll-snap plus mouse drag, one `setTimeout` countdown (7s) that any click, tap, swipe, drag, wheel or key restarts (a burst of wheel events counts once), so auto-advance never skips a board. Hover and focus pause it, reduced motion switches it off. The carousel and the story read `@merqo/ui`'s `usePrefersReducedMotion`, which follows the OS setting live. It is a labelled carousel region; each dot is a 44px tap target. Each ticket is the board's real `OrderCard` fed sample rows (so the hero cannot drift from the product), inside an `inert` grid so its buttons never reach a server action while the track still gets mouse drag. Sample times are seeded after mount and re-seeded when a board comes into view, which restarts the "Mark Picked Up" drain bar (a 10s hero window with tickets ready 3s ago, so it empties over the 7s view). The grid is keyed on its seed so cards remount with a fresh clock (`OrderCard`'s `useNow` reads it once on mount). The Rush board starts just under the amber and red thresholds (`startAgeMins`) and jumps over them at half the board's view (reduced motion shows the final ages directly). From 960px the card is absolutely filled into its cell so the text column sets the hero row height (pill row to buttons), and the ticket grid is zoomed by one shared measured scale (`fitScale`, `--hero-zoom` on the track, 0.8 down to a 0.6 floor, recomputed by a `ResizeObserver`) so the tallest board's grid and caption fit without scrolling.
- `rhythm.ts` — the landing's one spacing scale as shared class strings
  (`CONTAINER`, `SECTION_*`, `CHAPTER_*`): 80px then 96px between major
  sections, 40px then 48px each side of a
  chapter rule, so a rule reads as the same break as a section edge. Add new
  landing spacing here instead of writing new padding classes in `page.tsx`.
- `journey/` — the scroll-and-try journey below the hero (customer, stall and queue chapters, closing call, FAQ rows); see its README.
- `hero-preview-carousel.dom.test.tsx` — RTL test for the carousel: real ticket parts, closed ticket without footer, the 7s advance, the countdown restart on interaction, no double jump, reduced motion and dot navigation.
- `landing-boards.ts` — `LANDING_BOARDS`: the five sample boards (Mark Ready, Start, Says paid, Rush, Ready) with their captions, every ticket active. `toBoardOrder(sample, seedMs, flipped)` (optional `SampleOrder.startAgeMins` is used until `flipped`) turns a sample into a real `BoardOrder` with timestamps relative to the seed; `SAMPLE_AGING_MIN`, `SAMPLE_OVERDUE_MIN` and `SAMPLE_AUTO_CLEAR_MS` (10s) and `SAMPLE_READY_AGO_SEC` (3s) are the thresholds the hero draws with.
- `landing-cta.tsx` — `LandingCta({ href, children, variant, event })`: a landing-page call-to-action `Button`+`Link` that fires an optional analytics event (`logEvent`) on click before navigating.

## Connectivity

`nav.tsx`'s `Nav` is rendered by both
`src/app/page.tsx` (the landing page), `src/app/about/page.tsx` and `src/app/faq/page.tsx`, each passing `await getLandingNavUser(user)` and the `signOutToHome` action.
`wordmark.tsx`'s `Wordmark` is rendered by `src/app/(auth)/login/page.tsx`.
None of these are used by the vendor dashboard, which has its own wordmark
markup inlined in `src/app/dashboard/dashboard-nav.tsx` (also composing
`@merqo/ui`, via `DashboardNav` rather than `LandingNav`).

## Parent

[components](../README.md)
