# widgets

## Purpose

Presentational pieces used by more than one feature: the ticket shell and its
section card, hints, pagination, the Pro lock, images, the social-links row,
the feedback form, the segmented switch and the page header.

## Contents

- `feedback-form.tsx` — `FeedbackForm({ source, boothId, orderNumber, token,
prompt, metric })`: compact rating widget posting to
  `submitFeedback` (`@/app/actions/feedback`) — `metric="stars"` (1–5, used
  for customer order ratings) or `"nps"` (0–10 recommend score, vendor→qkit).
- `hint.tsx` — `Hint({ label, children })`: the small (i) that says what a
  control is for, opening on tap (`InfoTooltip` from `@merqo/ui` with
  `trigger="tap"`). The rule it encodes: anything a vendor has to understand
  gets a `Hint` or visible text, because a hover tooltip never shows on a
  phone or an iPad; a hover `Tooltip` is only for naming an icon-only button
  on a desktop. Its 44px touch area on touch devices comes from
  `InfoTooltip` itself (`@merqo/ui` v0.32.2).
- `media-image.tsx` — `MediaImage(props)`: `next/image` wrapper that marks
  `.svg` sources `unoptimized` (avoids needing the global
  `dangerouslyAllowSVG` flag) while raster uploads still get full
  optimization.
- `page-header.dom.test.tsx` — the title is the only `h1`, the description
  renders only when given, no wrapper element is added, and `responsive`
  alone changes the phone size.
- `page-header.tsx` — `PageHeader({ eyebrow, title, responsive?, children? })`:
  the top of a dashboard or admin page: a small-caps label, the title in the
  display font, and an optional sentence under it (the children). Renders
  those elements with no wrapper, so each page keeps its own layout around
  them (a back link above, a button beside). `responsive` steps the title
  down one size on a phone, for a title sharing its row with a button. Used
  by 11 pages that each carried the same three elements by hand.
- `paginated.tsx` — `Paginated({ children, pageSize, variant, label,
alwaysShowCount })`: client-side pager over pre-rendered rows —
  `variant="pager"` (prev/next + "x–y of N", for admin tables) or `"more"`
  (Load more / Show less, for feeds). `alwaysShowCount` (pager only) shows
  the "x–y of N" readout even when everything fits on one page — useful
  when the count itself is meaningful context (e.g. confirming a filtered
  list wasn't over-narrowed), not just page-count bookkeeping; prev/next
  buttons still only appear once there's more than one page. The visible
  rows sit in their own `className`-styled wrapper, separate from the
  prev/next or Load-more row — a grid `className` (e.g. the completed-orders
  page) lays out only the rows, not the pager controls.
- `pro-lock.tsx` — `ProLock({ feature, label })`: an inline upgrade nudge
  linking to `/dashboard/plan`, logging an `upgrade_cta` event tagged with
  the specific gated `feature` for funnel analysis.
- `segmented-control.dom.test.tsx` — group label and pressed state, the
  tapped option reported, a locked option rendering as a non-switching link,
  and the touch height at both sizes.
- `segmented-control.tsx` — `SegmentedControl({ options, value, onChange,
ariaLabel, size? })` (client): a bordered row of pills with one active,
  for switching a view (sort order, date range, ranking), not for a form
  value. A `role="group"` of buttons carrying `aria-pressed`, 44px tall on a
  coarse pointer at either `size`. An option with `lockedHref` renders as a
  link with a lock (an out-of-plan Stats range) and never calls `onChange`.
  Replaces four hand-rolled copies (board sort, Completed date range, Stats
  range, "By volume / By revenue"). Also exports `SEGMENT_GROUP_CLASS`, the
  track, for the booth form's two sub-mode switches: those are radio inputs
  in a form, so they stay a `ToggleGroup` and only share the look.
- `site-footer.test.tsx` — wordmark, tagline, copyright, About, Terms and
  Privacy links; sign-in link only with `showSignIn`.
- `site-footer.tsx` — `SiteFooter({ showSignIn })`: `@merqo/ui`'s family
  `Footer` with qkit's wordmark and tagline. The landing page and `/about`
  pass `showSignIn`; the dashboard layout ends with it, without.
- `social-links-row.dom.test.tsx` — RTL tests for `SocialLinksRow`'s
  empty/partial-link rendering.
- `social-links-row.tsx` — `SocialLinksRow({ links })`: read-only icon row
  of a vendor's set social links, built on `@merqo/ui`'s `SOCIAL_LINK_FIELDS`
  (real brand marks via `@icons-pack/react-simple-icons`, `website` gets a
  generic Lucide `Globe` instead), each on a fixed light chip (not the page's
  theme background) so single-color marks like TikTok's stay legible in
  dark mode too; renders nothing when `links` is empty. Shown on the
  order-status page footer and on a closed booth's menu-page banner. The
  matching edit form, `SocialLinksFields`, also now lives in `@merqo/ui` —
  see `dashboard/booths/social-links-section.tsx` and
  `dashboard/profile/profile-form.tsx` for its two call sites.
- `ticket-section.dom.test.tsx` — RTL tests confirming `Section` renders
  inside the local `Ticket` shell, forwards icon/title/description to the
  shared header, and shows the tooltip on hover.
- `ticket-section.tsx` — `Section({ icon, eyebrow, title, description,
tooltip, children })`: thin local wrapper around `@merqo/ui`'s `Section`,
  passed the local `Ticket` shell via `wrapper` so the header/icon/eyebrow/
  title/tooltip rendering is shared while the "ticket card" paper visual
  (scalloped edge, icon chip, spacing) stays qkit-specific. Used by
  settings/profile/booth-form pages. `tooltip` (optional) renders an
  `InfoTooltip` next to the title for detail that doesn't need to be visible
  by default — used by the settings page's Notifications card for its
  iOS/Android caveat.
- `ticket.tsx` — `Ticket({ as, shadow, radius, dashed, clip, borderColor,
...props })`: the shared "kitchen ticket" card look (scalloped/perforated
  edge via the `.ticket` CSS class) — centralizes border/radius/shadow so
  every card in the app renders identically instead of each hand-rolling its
  own combination.
- `zoomable-image.tsx` — `ZoomableImage({ src, alt, sizes })`: a menu photo
  that opens fullscreen in a `Dialog` on tap, with a corner expand-icon
  affordance.

## Parent

[components](../README.md)
