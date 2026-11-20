# landing

## Purpose

The "QKit" wordmark surfaces and the site chrome shared across the
landing page and `/about`: the sticky top nav and the plain
inline mark used on the login page.

## Contents

- `nav.tsx` — `Nav({ account, signOutAction })` (a client component, so
  it can pass `next/link` to the shared account menu): the sticky top nav,
  shared by the landing page, `/about` and `/faq`. Composes `@merqo/ui`'s
  `LandingNav` shell (sticky positioning, background blur, border, and the
  responsive `end`-slot gap live there) and supplies the wordmark (a plain
  `<a href="/#top">`, since `Link` leaves the old hash in the URL bar on a
  fragment-only jump) and the right-side content. "FAQ", "About" and
  "Dashboard" are all `Button asChild variant="ghost"` links so they render
  identically; a bare styled `Link` made FAQ look different before. Signed
  in (`account` set) shows "Dashboard" plus `@merqo/ui`'s `AccountMenu`
  (avatar dropdown with sign out, help and feedback wired to
  `submitSupportMessage`/`submitFeedback`); signed out shows "Sign in" and
  "Get started".
- Tap targets: every nav control is at least 44x44px below `sm` (links via
  `h-11 min-w-11`, the `@merqo/ui` avatar trigger via an arbitrary child
  variant on its wrapper) and keeps the 32px look from `sm` up.
- `nav.dom.test.tsx` — signed out has no account menu, signed in has
  Dashboard plus a menu whose Sign out calls the action, and FAQ, About and
  Dashboard share the same styling classes.
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
- `hero-preview-carousel.tsx` — `HeroPreviewCarousel()`: the hero's sample-board carousel over `LANDING_BOARDS`. Native scroll-snap plus mouse drag, one `setTimeout` countdown (7s) that any click, tap, swipe, drag, wheel or key restarts, so auto-advance never skips a board. Hover and focus pause it, reduced motion switches it off. It is a labelled carousel region; each dot is a 44px tap target.
- `rhythm.ts` — the landing's one spacing scale as shared class strings
  (`CONTAINER`, `SECTION_*`, `CHAPTER_*`): 80px then 96px between major
  sections, 40px then 48px each side of a
  chapter rule, so a rule reads as the same break as a section edge. Add new
  landing spacing here instead of writing new padding classes in `page.tsx`.
- `journey/` — the scroll-and-try journey below the hero (customer, stall and queue chapters, closing call, FAQ rows); see its README.
- `hero-preview-carousel.dom.test.tsx` — RTL test for the carousel: real ticket parts, closed ticket without footer, the 7s advance, the countdown restart on interaction, no double jump, reduced motion and dot navigation.
- `landing-boards.ts` — `LANDING_BOARDS`: the five sample boards (Mark Ready, Start, Says paid, Rush, Ready) with their captions.
- `landing-cta.tsx` — `LandingCta({ href, children, variant, event })`: a landing-page call-to-action `Button`+`Link` that fires an optional analytics event (`logEvent`) on click before navigating.
- `sample-ticket.tsx` — `SampleTicket({ order })`: one hero ticket assembled from the board's own parts (`Ticket`, `TicketItems`, `AttentionLine`, `TicketFooter`, `OrderStatusBadge`, `ticketAttention`) so it cannot drift from `OrderCard`. The wired parts (more menu, buttons) are plain text. A closed ticket has no footer and aligns to the start.

## Connectivity

`nav.tsx`'s `Nav` is rendered by both
`src/app/page.tsx` (the landing page), `src/app/about/page.tsx` and `src/app/faq/page.tsx`, each passing `toLandingAccount(user)` and the `signOutToHome` action.
`wordmark.tsx`'s `Wordmark` is rendered by `src/app/(auth)/login/page.tsx`.
None of these are used by the vendor dashboard, which has its own wordmark
markup inlined in `src/app/dashboard/dashboard-nav.tsx` (also composing
`@merqo/ui`, via `DashboardNav` rather than `LandingNav`).

## Parent

[components](../README.md)
