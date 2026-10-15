# order

## Purpose

Components specific to the customer ordering flow: the menu/cart form itself,
the on-device "your recent orders" list, and the hard-block screen for a
stale QR code.

## Contents

- `expired-code.tsx` — `ExpiredCode({ variant })`: full-screen block shown at
  HTTP 200 (not a 404) for a stale/missing QR token — `"expired"` (default,
  "ask the booth for the current QR") vs. `"error"` (a transient backend
  failure, "try again in a moment" — the code may still be valid, so telling
  the customer to rescan would be wrong).
- `expired-code.dom.test.tsx` — RTL test covering both variants' copy.
- `order-form.tsx` — `OrderForm({ code, boothId, menuItems, menuCategories,
closed, remaining })`: the full menu + cart + checkout UI. Seeds the cart on
  mount from either a `takeReorder` handoff (explicit reorder intent, wins)
  or a persisted `loadCart` (in-progress cart from a prior visit),
  reconciling either against the live menu/stock (`reconcileReorder`).
  Tracks a `Map<string, CartItem>` cart keyed by `cartKey(menuItemId,
options)`, persists it on every change (`saveCart`), enforces per-item
  stock caps (`remainingFor`/`blockedByStock`), and opens `ItemCustomizer` for
  items with option groups. Anonymous basket holds show advisory competition
  for stock; they never disable purchases or trim a cart. Eligibility uses
  unsold stock including held items and the vendor's per-order limit. Stock
  is checked again by the database when placing an order; baskets do not
  reserve it. The "Your order" cart summary is collapsed by
  default (`cartExpanded` state, toggled by tapping its header) so it doesn't
  push a long multi-section menu further down the page — the collapsed header
  still shows the live item count/total, and expanding it is the only way to
  adjust or remove a customized (option-group) item, since those don't get
  the inline +/- the plain-item cards do. The sticky bottom bar is a trigger,
  not a submit button: tapping it opens a bottom `Sheet` ("Who's this for?")
  holding an itemized order recap (each line's name, options, and price,
  between perforation dividers echoing the `Ticket` component's own stub
  styling) so the customer can see exactly what they're confirming, the name
  and optional phone fields, the real submit, and a "Back to menu" close
  action — this keeps checkout a single short step regardless of how long
  the menu above it is (a multi-section menu no longer buries the fields at
  the bottom of a long scroll). Submit calls `placeOrder` (`@/app/o/[code]/actions`) with a
  stable idempotency key across automatic and manual retries of an unresolved
  same-payload submission. After ambiguous transport failures, changing the
  payload is blocked until the previous request is resolved. The pending key
  and a normalized SHA-256 payload fingerprint survive reload in per-booth
  session storage, without storing customer names or phone numbers. A recovery
  warning asks the customer to re-enter the same details. Corrupt recovery
  metadata blocks a new submission. When browser storage is unavailable, the
  key remains in memory and a warning asks the customer to keep the page open
  until confirmation; an initial order remains available.
  Success then
  clears the cart, stashes an `addRecentOrder` entry, and navigates to the
  order-status page (or, for a payment-required order, to `../pay`; that
  entry has the access token but no order number yet). The phone field is a genuinely optional convenience
  (cross-kit customer identity, migration `0075`), never required to
  submit, passed through `placeOrder`'s `customerPhone` input. Between the
  fields and the submit button the sheet renders `@merqo/ui`'s
  `DataCollectionNotice` ("We use your phone number and name to identify your
  order and send you order updates. See our Privacy Policy.", linking to
  `/legal/privacy`), the PDPA notification at the point of collection. Display
  only: no consent is recorded, and no SMS, voice or fax marketing exists, so
  the Do Not Call Registry does not apply. Menu items
  render grouped under `menuCategories` (`@/lib/menu-sections`'s
  `groupByCategory`) once there are 2+ non-empty sections. From `md` up that
  is a two-pane layout: a sticky jump-nav sidebar (own `overflow-y-auto`, so
  it scrolls independently if sections overflow the viewport) beside the
  scrolling item list. Below `md` the same nav is a row of chips pinned to
  the top of the screen, scrolling sideways: the sidebar took 92px of a 375px
  phone and left an item's name 5 to 31px, and a pinned row keeps the full
  width without bringing back the scroll-up-to-switch problem of the old
  unpinned pill row. Item names and descriptions wrap to two lines instead of
  truncating, and a card for an item with options says how many are in the
  basket. (The sidebar dates from 2026-09-15 — replaced the old horizontal
  pill-row nav, which forced a scroll-up-then-tap-then-scroll-down cycle on
  mobile to switch sections). Each sidebar link shows its section's first
  item's `image_url` as a thumbnail (`MediaImage`, Oddle-style), falling
  back to a label-only chip when none of that section's items has one; the
  sidebar itself is narrower with a 2-line-clamped label on mobile, wider
  with a single-line label on `md:` and up (see `src/app/o/[code]/page.tsx`
  for the matching container-width bump so the two panes have room). A
  booth with 0 or 1 category falls back to the original flat "Menu" list,
  no sidebar chrome. Each card row also renders `AllergenBadges`
  (`@/components/order/allergen-badges`, 2026-09-01) from `item.allergens` —
  works even while the booth is closed and browse-only, since it doesn't
  depend on opening `ItemCustomizer` (which items with no option groups
  never even offer a button for).
- `order-form.dom.test.tsx` — RTL tests covering cart add/increment/decrement,
  stock-cap blocking, reorder seeding/reconciliation, the closed-booth submit
  guard, the placeOrder retry-then-fail path, the phone field (renders,
  optional — submits with it blank, passes its value through when filled),
  category sections (flat fallback for 0/1 category, grouped headings +
  sidebar nav for 2+, unmatched/stale category ids bucketed into "Other"
  last, sidebar thumbnail from a section's first imaged item or none),
  the card-level allergen badges (one tappable icon per tag, nothing for
  an item with none, tap reveals the name — works with the booth closed),
  the cart summary's collapsed-by-default/expand-on-tap behavior, that the
  sticky trigger opens the checkout sheet (itemized recap included) rather
  than submitting directly, and that an empty name inside the sheet focuses
  the field instead of calling `placeOrder`, and that the data-collection
  notice and its Privacy Policy link render above the submit button.
- `recent-orders.tsx` — `RecentOrders({ boothId })`: reads
  `getRecentOrdersForBooth` from localStorage post-mount (avoids an SSR
  hydration mismatch — there's no server-side customer identity), rendering
  a collapsed-then-"Show all" list of `Link`s to each past order's status
  page. An entry with no order number yet (a payment-required order) reads
  "New order" and links to `/order/{boothId}/pay?t=…`, which sends a numbered
  order on to its status page and says when an unpaid one has expired.
- `menu-item-card.tsx` — `MenuItemCard`: one item on the customer's menu
  (photo, name, price, allergens, stock note) with "Add" then a stepper for a
  plain item, or the customizer button and an "N in your order" line for an
  item with options. Moved out of `order-form.tsx`, which now passes it the
  item's basket and stock state.
- `allergen-badges.tsx` — `AllergenBadges({ tags })`: icon-only allergen row
  for a menu card (2026-09-01) — one `InfoTooltip` (`@merqo/ui`, `trigger="tap"`
  since this is a mobile-first customer surface where hover never fires) per
  tag, icon from `@/lib/allergen-icons`, tap/hover reveals the capitalized
  name. Card-level, so it only reads `item.allergens` (fixed allergens) —
  no selection has happened yet at list level, unlike `item-customizer.tsx`'s
  live choice-derived union. Renders nothing for an empty/`undefined` list.
  Used by `order/order-form.tsx`'s menu card row; the dedicated Customize
  sheet keeps its own icon+word badges (see `item-customizer.tsx` below).
- `item-customizer.tsx` — `ItemCustomizer({ item, onClose, onAdd })`: a
  bottom `Sheet` for picking a menu item's option groups (single-select via
  `ToggleGroup type="single"`, multi-select via `type="multiple"`, keyed by
  item id so switching items remounts with fresh default selections) before
  adding it to the cart. Shows a live running price delta (informational
  only — `place_order` re-derives the authoritative total server-side from
  the stored menu) and an always-visible allergen badge list (the item's
  fixed allergens unioned with every currently-selected choice's allergens,
  never behind an accordion — a safety signal, not optional complexity),
  each badge pairing its `@/lib/allergen-icons` icon with the tag's name
  (2026-09-01 — was text-only; the card-level `AllergenBadges` above stays
  icon-only, this dialog keeps the fuller icon+word treatment).
- `item-customizer.dom.test.tsx` — RTL tests for the running-total math
  (single-select replace vs. multi-select sum across groups) and the
  allergen badges (fixed vs. selection-derived, added/dropped on choice
  change).
- `reorder-button.tsx` — `ReorderButton({ boothId, lines, customerName,
label })`: stashes a past order's lines via `stashReorder` and navigates to
  the booth's menu page, where `OrderForm` reconciles them against the live
  menu/stock.

## Connectivity

Rendered by `src/app/o/[code]/page.tsx` (`OrderForm`, `RecentOrders`) and by
that same route's `ExpiredCode` fallback when the short code doesn't resolve.
`OrderForm` calls the `placeOrder` server action living in
`src/app/o/[code]/actions.ts` and, on success, routes to
`/order/[boothId]/[orderNumber]`. `ReorderButton`
(`@/components/order/reorder-button.tsx`) and the status page's "Order again" link
are what stash the reorder handoff `OrderForm` reads on mount.

## Parent

[components](../README.md)
