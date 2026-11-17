# landing

## Purpose

The "QKit" wordmark surfaces and the site chrome shared across the
landing page and `/about`: the sticky top nav and the plain
inline mark used on the login page.

## Contents

- `nav.tsx` — `Nav({ authed })`: the sticky top nav, shared by the
  landing page and `/about`. Composes `@merqo/ui`'s `LandingNav` shell
  (sticky positioning, background blur, border, and the responsive
  `end`-slot gap all live there) — this file supplies only the wordmark
  and right-side content: a plain `<a href="/#top">` (not `next/link`'s
  `Link` — a same-page hash jump needs a native anchor so the URL bar's
  hash always updates, which `Link` doesn't reliably do when only the
  fragment changes) as `wordmark`, and, as `end`, "FAQ" (`/#faq`, an
  absolute path since this nav also renders on `/about`, not just `/`)
  and "About" links plus either a "Dashboard" link (`authed`) or "Sign
  in" + "Get started" links (signed out).
- `nav.test.tsx` — asserts the About/FAQ/Sign-in/Get-started/Dashboard
  link targets, and that the FAQ link (`/faq`, a plain text link) is not
  hidden below `sm`, while the signed-out "Sign in" link is hidden below `sm`
  to keep the row on one line at 320px (the login page has its own
  sign-in switch).
- `wordmark.tsx` — `Wordmark({ size?, className? })`: thin wrapper over
  `@merqo/ui`'s `Wordmark` shell that supplies the "qkit" letters and the
  `text-primary` accent on the q. Used by the login page's two panels (`lg`
  and `xl`) and the MFA page (`lg`), where the nav shell doesn't apply.
- `wordmark.test.tsx` — asserts the text, the accent class and the size class.
- `hero-preview-carousel.tsx` — `HeroPreviewCarousel()`: the landing hero's
  swipeable "live order board" carousel over `LANDING_BOARDS` — native
  scroll-snap plus pointer-drag and a 10s auto-advance timer (paused on
  interaction, skipped under reduced motion), decorative (`aria-hidden`); each dot is a 44px tap target around a 6px visual.
- `rhythm.ts` — the landing's one spacing scale as shared class strings
  (`CONTAINER`, `SECTION_*`, `CHAPTER_*`): 80px then 96px between major
  sections and for the pain band's padding, 40px then 48px each side of a
  chapter rule, so a rule reads as the same break as a section edge. Add new
  landing spacing here instead of writing new padding classes in `page.tsx`.
- `journey/` — the scroll-and-try journey below the hero (customer, stall and queue chapters, closing call, FAQ rows); see its README.
- `hero-preview-carousel.dom.test.tsx` — RTL test for carousel dot
  navigation/active state.
- `landing-board.tsx` — `LandingBoard({ board })`: renders one "live order
  board" ticket container (title + active-count pulse badge) for the hero
  carousel, laying out its `LandingTicket`s in a 2-col grid.
- `landing-board.dom.test.tsx` — RTL test for `LandingBoard` rendering.
- `landing-boards.ts` — `LANDING_BOARDS`: static sample data for the 4 hero
  scenario boards (coffee cart, ice-cream cart, a payment-claim flow, a
  "rush" with aging/overdue tickets).
- `landing-cta.tsx` — `LandingCta({ href, children, variant, event })`: a
  landing-page call-to-action `Button`+`Link` that fires an optional
  analytics event (`logEvent`) on click before navigating.
- `landing-ticket.tsx` — `LandingTicket({ t })`: presentational "order chit"
  mirroring the real `OrderCard`'s layout for the landing hero: a large
  number and name, every option on one line with nothing to expand, a single
  attention line ("Not paid yet", "Says paid. Check the payment", same wording
  as `ticketAttention`), a status badge only past preparing, the aging wash,
  and one action button.
  No prices or totals. No server actions, purely
  decorative sample data.
- `landing-ticket.dom.test.tsx` — RTL test for `LandingTicket` rendering
  across status/payment/age combinations, the single attention line, and
  options shown without a toggle.

## Connectivity

`nav.tsx`'s `Nav` is rendered by both
`src/app/page.tsx` (the landing page) and `src/app/about/page.tsx`.
`wordmark.tsx`'s `Wordmark` is rendered by `src/app/(auth)/login/page.tsx`.
None of these are used by the vendor dashboard, which has its own wordmark
markup inlined in `src/app/dashboard/dashboard-nav.tsx` (also composing
`@merqo/ui`, via `DashboardNav` rather than `LandingNav`).

## Parent

[components](../README.md)
