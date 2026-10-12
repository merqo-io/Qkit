---
name: qkit
description: Live booth ordering on a kitchen ticket, in Market Ochre.
colors:
  khaki: "oklch(0.664 0.123 78.3)"
  khaki-text: "oklch(0.46 0.095 78.3)"
  deep-grayish-olive: "oklch(0.468 0.049 94.3)"
  diamine-green: "oklch(0.495 0.112 154.6)"
  diamine-green-text: "oklch(0.45 0.105 154.6)"
  chalk-cream: "oklch(0.918 0.038 86.9)"
  ticket-paper: "oklch(0.99 0.012 86.9)"
  charcoal-ink: "oklch(0.273 0.014 67.2)"
  quiet-paper: "oklch(0.93 0.014 76)"
  quiet-ink: "oklch(0.48 0.022 55)"
  hover-paper: "oklch(0.9 0.038 70)"
  rule: "oklch(0.75 0.025 70)"
  field-rule: "oklch(0.59 0.02 72)"
  stop-red: "oklch(0.55 0.2 27)"
  stop-red-text: "oklch(0.49 0.19 27)"
  caution-amber: "oklch(0.65 0.19 55)"
  caution-amber-text: "oklch(0.47 0.16 55)"
  stamp-pending: "oklch(0.72 0.15 75)"
  stamp-preparing: "oklch(0.62 0.18 40)"
  stamp-ready: "oklch(0.6 0.13 154.6)"
  stamp-completed: "oklch(0.55 0.01 60)"
  stamp-cancelled: "oklch(0.58 0.2 27)"
  stamp-says-paid: "oklch(0.52 0.13 245)"
typography:
  display:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontWeight: 600
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.14em"
  numeral:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontWeight: 700
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  gutter: "20px"
  card: "16px"
  stack: "12px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.khaki}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.xl}"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.ticket-paper}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.lg}"
    height: "44px"
  button-says-paid:
    backgroundColor: "{colors.stamp-says-paid}"
    textColor: "{colors.ticket-paper}"
    rounded: "{rounded.lg}"
  ticket:
    backgroundColor: "{colors.ticket-paper}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.2xl}"
  input:
    backgroundColor: "{colors.ticket-paper}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.xl}"
    height: "44px"
  chip-choice:
    backgroundColor: "{colors.ticket-paper}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.lg}"
    height: "44px"
  chip-choice-selected:
    textColor: "{colors.khaki-text}"
    rounded: "{rounded.lg}"
    height: "44px"
---

# Design System: qkit

## Overview

**Creative North Star: "The Market Ticket"**

Every surface in qkit is a kitchen ticket lying on a stall counter. The page is chalk-cream paper with a faint grain; each card is a slip of whiter paper with a perforated, scalloped top edge, as if torn off a roll. Numbers are set in a typewriter mono, headings in a soft old-style serif, and status is a rubber stamp in one flat colour. The system exists to be read standing up, at arm's length, in daylight, by someone with wet hands and a queue.

The palette is "Market Ochre", anchored on combination 146 of Sanzo Wada's _A Dictionary of Color Combinations_: Khaki, Deep Grayish Olive and Diamine Green. It is warm and slightly dusty, closer to kraft paper and a chalkboard menu than to an app. The earlier ember and orange-red identity was retired because it read as another product's brand. Do not move back toward it.

Density differs by who is looking. The vendor's board is dense and fast: many tickets, one glance each. The customer's pages are single-column and unhurried: one decision per screen, thumb-sized controls.

**Key Characteristics:**

- Paper on paper: cream page, whiter tickets, a scalloped top edge on every card
- One warm accent (Khaki) for the next action; olive as its quiet counter-tone
- Status carried by colour and by a word or icon together, never colour alone
- Mono numerals for order numbers, prices and counts; serif for names of things
- 44px touch targets wherever the pointer is coarse
- Flat by default: a 2px printed-edge shadow, not a floating one

## Colors

A dusty, daylight palette: one ochre, one olive, one green, on warm paper with charcoal ink. Values are OKLCH and live in `src/app/globals.css`; a dark theme redefines each token on near-black paper with cream ink.

### Primary

- **Khaki** (`{colors.khaki}`, Wada 146, `#bc892b`): the fill of the one button that is the next step, the selected state of a choice, the accent "Q" of the wordmark, focus-adjacent highlights. Carries charcoal ink as its label, not white.
- **Khaki, text grade** (`{colors.khaki-text}`): the same hue darkened for words on paper: prices, links, the eyebrow above a page title. Khaki at fill strength is too light to read as text on cream and is never used for it.

### Secondary

- **Deep Grayish Olive** (`{colors.deep-grayish-olive}`, Wada 146, `#635a3a`): a counter-tone for small marks that are not actions, such as the plan badge. It is a colour, not a neutral: hover and quiet surfaces use the neutrals below.

### Tertiary

- **Diamine Green** (`{colors.diamine-green}`, Wada 146, `#1a7444`): success and "open". With its text grade (`{colors.diamine-green-text}`) for words.

### Neutral

- **Chalk Cream** (`{colors.chalk-cream}`): the page.
- **Ticket Paper** (`{colors.ticket-paper}`): cards, popovers, fields.
- **Charcoal Ink** (`{colors.charcoal-ink}`): body text, and the focus ring.
- **Quiet Paper** (`{colors.quiet-paper}`) and **Quiet Ink** (`{colors.quiet-ink}`): muted surfaces and secondary text.
- **Hover Paper** (`{colors.hover-paper}`): hover and pressed surfaces.
- **Rule** (`{colors.rule}`) and **Field Rule** (`{colors.field-rule}`): card borders and perforations; the darker one outlines inputs so a field is findable on paper.

### Status stamps

Order status is a stamp: pending (`{colors.stamp-pending}`), preparing (`{colors.stamp-preparing}`), ready (`{colors.stamp-ready}`), completed (`{colors.stamp-completed}`), cancelled (`{colors.stamp-cancelled}`), and "says paid" (`{colors.stamp-says-paid}`), the one blue in the system, reserved for a payment that needs the vendor's confirmation. Warnings use **Caution Amber** and errors **Stop Red**, each with a text grade.

### Named Rules

**The Two Grades Rule.** Every colour that can appear as text has a `-text` twin dark enough for 4.5:1 on cream. Fills, borders and dots use the fill grade; words use the text grade. The Tailwind theme maps `text-*` utilities to the text grade, so `text-primary` is already correct.

**The Ink Ring Rule.** The focus ring is charcoal ink, not Khaki. At the 50% opacity the primitives draw it, Khaki falls under 3:1 against paper.

**The One Blue Rule.** Blue means "the customer says they paid; check it". Nothing else is blue.

## Typography

**Display Font:** Fraunces (with ui-serif, Georgia)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui)
**Label/Mono Font:** Space Mono (with ui-monospace)

**Character:** A soft, slightly wonky serif for the names of things (the booth, the page, the dish of the day) against a plain, legible grotesque for everything you act on. Mono is the receipt printer: it sets anything you would read aloud at a counter.

### Hierarchy

- **Display** (Fraunces 600, -0.015em, optical sizing on): page titles, booth names, empty-state lines, the landing headline. One per screen.
- **Title** (Hanken Grotesk 500 to 600, 1rem to 1.125rem): item names, card headings, dialog titles.
- **Body** (Hanken Grotesk 400, 1rem, 0.875rem for secondary): descriptions, help, form text. Inputs stay at 16px so iOS does not zoom.
- **Label** (Hanken Grotesk 600, 0.75rem, uppercase, 0.14em to 0.18em tracking): section eyebrows, column headers ("INCOMING (3)"), field captions.
- **Numeral** (Space Mono 700): order numbers, prices, quantities, timers. On a ticket the order number is the largest thing, with its last digit in Khaki for shelf-slot pickup.

### Named Rules

**The Read-Aloud Rule.** If staff would call it out or a customer would show it at the counter, it is set in mono.

## Layout

Single column, mobile first. Customer pages sit in a narrow measure (`max-w-sm` for status and payment, `max-w-lg` for the menu, widening to `max-w-2xl` with a side rail of sections from `md`). The vendor dashboard is `max-w-7xl` with a 20px gutter; the board is a card grid of one column on a phone, up to four on a wide screen, split into Incoming and Accepted columns when both have orders. On a phone those two columns become a switch, so the first screen is tickets, not chrome.

Rhythm is loose between groups (28px under a page header, 32px between board columns) and tight inside a ticket (12px to 16px). Sticky elements are few and earn it: the customer's checkout bar, the menu's section chips on a phone, the board's batch bar in select mode. Bottom-fixed bars pad for the safe-area inset.

**The Coarse Pointer Rule.** Sizes in components are the compact ones a mouse gets. A `pointer: coarse` rule raises buttons, menu rows and close buttons to 44px. Size by pointer, not by breakpoint: a tablet at a stall is wide and still a finger.

## Elevation & Depth

Flat, like print. A ticket has a 2px bottom edge in the rule colour (`0 2px 0 0 var(--color-border)`), which reads as paper thickness, not as floating. A second, lifted variant adds a long soft warm shadow and is used sparingly for a hero card. Dialogs and sheets sit on a dimmed page. Depth is otherwise carried by the two paper tones.

**The Printed Edge Rule.** No blurred drop shadows on working surfaces. If a card needs to stand out, it gets a wash or a border, not a glow.

## Shapes

Corners are soft but not pill-like: tickets 16px, list cards and inputs 12px, compact buttons 8px. Fully rounded is kept for header controls and batch buttons on the board, which read as toggles and chips. The signature form is the **scalloped top edge**: a row of 6px half-circles in the page colour bitten out of the top of every ticket. Its companion is the **perforation**, a 1.5px dashed rule that divides sections of a ticket or the FAQ.

A card that clips its content (a full-bleed photo) loses its scallop, so clipping is opt-in.

## Components

### Buttons

Confident and plain, sized for a thumb.

- **Shape:** 8px to 12px corners; 44px to 48px tall for a primary action.
- **Primary:** Khaki fill, charcoal label, semibold. One per view: on the payment page the fill moves from "attach screenshot" to "send" as the customer progresses.
- **Outline:** ticket-paper fill, rule border, charcoal label. The default for everything that is not the next step.
- **Says paid:** the one blue fill with a white label, for confirming a claimed payment. It wraps to two lines rather than truncating an amount.
- **Destructive:** stop-red text on an outline, filling red on hover. Closing or pausing a booth from the editor also asks for a 3 second hold.
- **Hover / Focus:** hover shifts to Hover Paper; focus is the ink ring.

### Chips

- **Choice chips** (item options): 44px, bordered, the price of a paid choice inside the chip in mono ("Oat Milk +$1.00"). Selected is a Khaki border, a faint Khaki tint and a text-grade label.
- **Section chips** (menu, phone): a sticky horizontal row; from `md` it becomes a side rail.
- **Status badge:** a word in the stamp colour's text grade, on a tinted, bordered ground of the same colour.

### Cards / Containers

- **Ticket:** the system's card. Ticket-paper ground, rule border, 16px corners, scalloped top, printed-edge shadow, 16px padding.
- **Attention wash:** on the board a ticket's whole ground changes, one wash at a time by priority: overdue (red) over says-paid (blue) over ageing (amber). An overdue ticket also says "Late" and shows a warning icon.
- **Dashed ticket:** empty states ("All caught up") use a dashed border and no shadow.

### Inputs / Fields

- **Style:** ticket-paper ground, Field Rule border, 12px corners (8px for compact fields inside a ticket), 40px to 48px tall and 44px on touch.
- **Label:** above the field, always visible. A placeholder is an example or a default ("Walk-up"), never the label.
- **Error:** stop-red text beneath, linked with `aria-describedby`; the field is marked invalid.
- **Switches** save the moment they are flipped; number fields wait for their Save button.

### Navigation

- **Dashboard:** a sticky header row with the wordmark, section links and the account menu.
- **Customer pages:** no navigation. A back link at most. The page is the task.

### Order ticket (signature)

The vendor's ticket is laid out to be read at a counter: order number largest and first (a heading, so a screen reader can jump between tickets), customer name beside it, one line per item with options always visible, a single attention line, then one action button the full width of the ticket. Advancing an order is one tap with a short visible Undo, not a confirmation dialog. Countdown bars (undo, auto-clear, hold) are thin, drain by `transform`, and stop under reduced motion.

## Do's and Don'ts

### Do:

- **Do** put new content on a `Ticket`. If it is a card, it has the scalloped edge.
- **Do** use the text-grade token for any coloured word; `text-primary`, `text-success`, `text-status-*` already resolve to it.
- **Do** pair every status colour with a word or an icon.
- **Do** set order numbers, prices and counts in Space Mono.
- **Do** keep one Khaki-filled button per view.
- **Do** make every control 44px on a coarse pointer, including menu rows and dialog close buttons.
- **Do** honour reduced motion: overlays appear at once, countdown bars do not animate.

### Don't:

- **Don't** move the palette back toward ember, orange or orange-red. It was retired for reading as another product's brand.
- **Don't** use Khaki, or any fill-grade status colour, as text on cream.
- **Don't** use `secondary` (olive) as a neutral hover or surface. Use Quiet Paper or Hover Paper.
- **Don't** use raw palette classes (`emerald-*`, `amber-*`, `blue-*`). Use the tokens.
- **Don't** use blue for anything but a payment awaiting confirmation.
- **Don't** add blurred drop shadows or glows to working surfaces.
- **Don't** clip a ticket unless a photo bleeds to its edge; clipping removes the scallop.
- **Don't** use an em dash in interface copy.
