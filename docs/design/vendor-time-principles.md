# Vendor-time design principles

Status: proposal. Written 2026-11-25 from Manfred's feedback and a code audit of `origin/staging`. No slice here starts without the owner's OK.

Paths are relative to the repo root. Line numbers were checked against `origin/staging` on the date above and will drift.

## 1. The vendor-time principle

### The rule

The owner's rule, after talking to Manfred:

> Anything that saves the vendor's time through automation, or cuts friction in churning out orders for customers, is a clean win. It beats polish.

The point is not speed for its own sake. A vendor with time back spends it on serving and talking to customers. That is the work only a person can do.

### What this means in practice

- A feature that removes a tap, a glance or a decision mid-rush ships before a feature that makes a screen prettier.
- Automation removes busywork. It does not remove the vendor from the customer.
- A vendor in the middle of service has wet hands, a queue and no patience. Design for that moment first.
- A vendor setting up at home has time. Setup can explain more, but it should still ask for less.

### The feature checklist

Every future feature must pass these six questions. Write the answers in the PR description.

| #   | Question                                                                      | Why it matters                                                                        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Does it remove a tap, a glance or a decision during a rush?                   | This is the clean-win test. If the answer is no, it needs another reason to exist.    |
| 2   | Does it hide what this step does not need?                                    | Fewer controls means faster scanning. Rare settings go behind a disclosure.           |
| 3   | Is every setting explained where it is used?                                  | A vendor should not need the help center to understand a switch.                      |
| 4   | Does it keep the vendor present with customers? Busywork goes, people stay.   | Manfred wants more human contact at events, not less. See section 2.                  |
| 5   | Does it work by touch on an iPad? Size controls by pointer (`coarse`).        | The board runs on a tablet at the booth. Hover-only and tiny targets fail there.      |
| 6   | Does it avoid showing controls that do not apply to this booth or this order? | A walk-up booth should not see booking controls. An unpaid order should not see Paid. |

### How the checklist applies to shipped work

| Shipped feature                    | Passes because                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| One-tap order advance on the board | Removes decisions mid-rush (1).                                               |
| Auto-clear of ready orders         | Removes a recurring tap and a stale card (1, 6).                              |
| Label printing per order           | Removes handwriting on cups (1) and keeps the vendor facing the customer (4). |
| `Hint` as tap-to-open, not hover   | Works by touch (5). See `src/components/widgets/hint.tsx`.                    |
| Walk-up order entry on the board   | Serves the customer who does not want the QR (4, 6).                          |

## 2. Manfred's input, in his words

Source: `docs/meta/2026-07-18-manfred-discovery-log.md` and `docs/meta/2026-09-10-manfred-second-aar-feature-backlog.md`. Those files hold the full record. This section keeps only what drives design.

### Who he is

He runs a coffee cart. It works weddings, corporate events and a shop. His needs split into two modes.

| Mode                         | What it looks like                      | What he needs from qkit                                      |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Walk-up and queue rush       | High volume, time pressure, many orders | Speed. Fewer taps. Less board tending.                       |
| Hospitality (weddings, corp) | Few guests, contact is the point        | Less admin so he can talk to guests. Not a self-serve kiosk. |

On hospitality mode he was explicit. He wants **more** human interaction at those events, not less. Anything that reads as "a kiosk replacing a person" cuts against that. Automation should remove his busywork, not his presence.

### Positioning

He does not see qkit competing with POS systems ("there's so many already"). His read is that the real prize is **challenging the roughly 30% commission** that Grab and foodpanda take on online ordering. A direct channel that does not hand a third of the sale to a platform is the pitch.

This is his opinion, not a finding of ours. It still shapes priorities: features that make the direct channel easy to run beat features that copy POS depth.

### Scan-to-start came from other vendors

He does not sell ice cream. He spoke to ice cream vendors and asked why they would not take online ordering. Their answer: if staff scoop on order and the customer arrives late, it melts. That research is where scan-to-start (hold prep until the customer arrives) came from. It was a problem he validated in an adjacent segment. It is not his own cart's pain.

### His six pain points, checked against code

Order is the order he raised them. Status is what `origin/staging` does today.

| #   | Pain point                                             | Status                         | Evidence                                                                                                                                                                                  |
| --- | ------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The board needs constant tending                       | Partly                         | Columns and batch select ship (`src/app/dashboard/board-columns.tsx`, `board-batch.tsx`). One-tap advance ships. Tending still takes attention; the 2026-09-10 AAR ranks it his top pain. |
| 2   | Ready orders sit until cleared (he floated about 15 s) | Shipped, coarser than he asked | `ready_auto_clear_min` is whole minutes, default 3, range 1 to 60 (`src/lib/types.ts:95`, `src/lib/schemas.ts:525`). UI in `src/app/dashboard/settings/board-timing-section.tsx`.         |
| 3   | Finding a past order is slow                           | Shipped                        | Search box "Search order # or customer name" in `src/app/dashboard/completed/completed-orders-list.tsx:178`. Wrongly cleared orders can be restored from the same view.                   |
| 4   | Handwriting on cups is slow and illegible              | Shipped, opt-in                | Per-booth switch in `src/app/dashboard/booths/printing-section.tsx`. Needs a label printer. He has not used it yet (2026-09-10 AAR).                                                      |
| 5   | Wants confirmation a PayNow payment went through       | Shipped through paykit         | Payments are paykit's. Local confirm path: `src/app/dashboard/order-payment-actions.ts` calls `confirmCheckout` from `src/lib/paykit/client.ts`. Not re-tested end to end for this doc.   |
| 6   | Mistyped amounts ($7.80 typed as $780)                 | Owned by paykit                | Exact-total QR is a paykit concern (see `../paykit/AGENTS.md`). qkit only stores a `{kind}` marker. Not verified here.                                                                    |

Reading the table: pain points 2 and 4 are the clearest gap between "shipped" and "in use". Point 2 needs a finer timer. Point 4 needs adoption, not code.

### His physical order-tab project

He is already working with a 3D-printing vendor on interactive order-build tabs, styled on Japanese physical ordering systems. Customers pick tabs to build the drink. His flow:

1. Customer builds the order at the tabs.
2. Some capture step reads the tabs.
3. The order appears live on the booth's board.
4. A sticker prints.
5. He makes the coffee.
6. The customer collects by order number.

Design consequence: qkit's order intake should stay easy to feed from outside the QR page. Do not assume every order starts on a phone.

### Reference, not request

He shared Once.film (scan a QR, the camera opens in the browser, photos "develop" later, no app download). Treat it as a touchstone for instant-on simplicity, not a feature.

### Open threads to ask him

These need his answer. Do not guess.

- How long does a drink really sit before a customer collects it? This sets the auto-clear timeout (slice 3 in section 5).
- How will the order tabs be captured (RFID or something else)? Not decidable from our side.
- Are any of his own items melt or temperature sensitive? Unconfirmed whether scan-to-start applies to his cart at all.

## 3. Journey and workflow audit

### Principle

Show only what the step needs. Hide the rest behind progressive disclosure. Explain each setting where it is used. Carry the vendor from one step to the next so they never wonder what to do.

### 3.1 Onboarding: current journey

| Step | Screen                                          | Code                                                      | Next step offered?                                                               |
| ---- | ----------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | `/onboarding`, one field                        | `src/app/onboarding/onboarding-form.tsx`                  | Yes, goes to the dashboard.                                                      |
| 2    | `/dashboard` empty state                        | `src/app/dashboard/board-empty-states.tsx:22-27`          | Yes: "Add your first booth" and an event-mode variant (`?mode=event`).           |
| 3    | New booth form                                  | `src/app/dashboard/booths/new/page.tsx`, `booth-form.tsx` | Saves, then redirects.                                                           |
| 4    | Redirect to `/dashboard/booths/{id}/menu?new=1` | `src/app/dashboard/booths/use-booth-save.ts:97-101`       | Yes.                                                                             |
| 5    | Menu editor                                     | `src/app/dashboard/booths/menu-manager.tsx:300-303`       | Yes: on first save it toasts and goes to the QR page.                            |
| 6    | QR page with the Go live card                   | `src/app/dashboard/booths/[boothId]/qr/go-live-card.tsx`  | Partly: links to the board ("Go to board", line 84) and to the menu and payment. |
| 7    | TV display                                      | `src/app/order/[boothId]/display/` (`queue-display.tsx`)  | No link back. It is a public page, so this may be right.                         |

Corrections to earlier assumptions, found while verifying:

- The menu does have a next step. A new booth's first menu save goes straight to the QR page.
- The Go live card does link to the board.
- The TV display is reached from the board through `src/app/dashboard/customer-screen-dialog.tsx`. It is a customer-facing page, so a back link is a design choice, not an obvious gap.

What is still missing is **one place that shows the whole path**. Each screen knows its own next step. No screen shows "you are on step 3 of 6" or what is left. A vendor who leaves the flow halfway has no way back in, except the empty states.

Proposed: a **setup checklist** that persists on the dashboard until done.

| Item                     | Done when                                       | Links to                           |
| ------------------------ | ----------------------------------------------- | ---------------------------------- |
| Create a booth           | A booth exists                                  | `/dashboard/booths/new`            |
| Add menu items           | The booth has at least one item                 | `/dashboard/booths/{id}/menu`      |
| Connect payment          | Paykit setup is complete, or skipped on purpose | The payment card on the booth form |
| Go live                  | The booth is open and the QR was viewed         | `/dashboard/booths/{id}/qr`        |
| Place a test order       | One order has reached the board                 | The booth page, then the board     |
| Set up the TV (optional) | The vendor opened the display once              | The customer screen dialog         |

Each item carries a "Watch 60 s" link to its video (section 4). The checklist hides itself when all required items are done.

### 3.2 Booth form: too much for a first save

The same form creates and edits a booth: `src/app/dashboard/booths/booth-form.tsx`. It renders eight `Section` blocks, plus a limits block inside Order flow.

| Section (line)             | What it holds                                                                                     | Needed to create?          |
| -------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| Name & photo (195)         | Booth name, photo                                                                                 | Name only. Photo optional. |
| Hours & availability (242) | Open switch, hours                                                                                | Yes.                       |
| Order flow (277)           | Hold prep until arrival, walk-up default, booking status, and limits (`booth-limits-section.tsx`) | No.                        |
| Menu (337)                 | Prompt to save first, then build the menu                                                         | No. It has its own page.   |
| Payment (368)              | Paykit-backed switch (`payment-section.tsx`)                                                      | No.                        |
| Printing (381)             | Label printer switch (`printing-section.tsx`)                                                     | No.                        |
| Pickup (396)               | Self-checkout kiosk switch (`pickup-kiosk-link.tsx`)                                              | No.                        |
| Social links (418)         | Links shown on the booth page                                                                     | No.                        |

Creating a booth needs a name, an optional photo, the open switch and hours. Everything else is tuning. A new vendor sees eight sections and cannot tell which matter.

Proposed:

- **Create form:** name, photo, open switch, hours. One screen, one Save.
- **Edit form:** same top block, then a "More settings" disclosure holding Order flow, Limits, Pickup and Social links.
- **Move the rest to where they are used.** Payment belongs in the go-live checklist. Printing belongs next to the printer status. Menu already has its own page.
- Keep one rule: a control that does not apply to the vendor's current mode stays hidden (checklist item 6). Booking status already only shows when walk-up default is on (`booth-form.tsx`, near line 315).

### 3.3 Amend flows: settings live far from where they matter

| Task                    | Today                                                                                | Cost to the vendor                            |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| Edit the menu           | Booths list, then Edit, then Menu (about 3 clicks)                                   | Slow to fix a sold-out item mid-service.      |
| Change payment          | Split between the booth form's Payment section and paykit itself                     | Two places, unclear which owns what.          |
| Change ready auto-clear | Settings page (`src/app/dashboard/settings/board-timing-section.tsx`), not the board | The setting is far from the problem it fixes. |
| Telegram notify toggle  | Settings page (`settings-form.tsx:269-281`)                                          | Same: away from the board.                    |
| Pause a booth           | Booth form and the booths list (`booth-list.tsx`)                                    | Fine, but not reachable from the board.       |

Proposed:

- **Shortcuts on the booth card:** Menu, QR, Pause. One tap each, no Edit step.
- **Board header shortcuts** for the two settings that change board behaviour mid-service.
- **Explain in place.** Every setting that stays on the settings page keeps its `Hint` (it already has one for auto-clear and Telegram).

### 3.4 Known issue: new-booth save can hang on "Saving..." (unverified)

Seen once on staging, in an automated Chrome tab. The booth was created but the form stayed on "Saving..." and did not redirect. **Not confirmed by hand.** Do not treat it as a reproduced bug.

Hypothesis, from reading the code:

- `src/app/dashboard/booths/use-booth-save.ts:97-102` calls `router.replace` to `/menu?new=1`, then awaits `navigatingAway()`. If that promise only resolves when navigation completes, the button stays in "Saving..." for as long as the heavy `/menu` render takes.
- `saveBooth` in `src/app/dashboard/booths/actions.ts` builds the row with `await paymentPatch(...)` (around line 458) before the write at line 461. `paymentPatch` calls paykit (`vendorPaymentSetup`, line 406). A slow paykit makes the save itself slow.

Either could produce the symptom, or neither. Next step is to reproduce by hand on staging, with the network tab open, before changing anything. See slice 5 in section 5.

## 4. Education layer

Four tools, each with one job.

| Tool               | Job                                          | Where it lives                                      |
| ------------------ | -------------------------------------------- | --------------------------------------------------- |
| In-context hint    | Explain one setting at the moment it is used | `src/components/widgets/hint.tsx`                   |
| Tour and checklist | Tell a new vendor what to do next            | `src/components/tour/`, plus the setup checklist    |
| Help center        | Answer "how do I" in words                   | `/dashboard/help`, `src/content/help/categories.ts` |
| Videos             | Show a core task in under 90 seconds         | Linked from the checklist and the help center       |

### 4.1 In-context hints

`Hint` is tap-to-open, because hover does not work on touch (checklist item 5). Today it appears directly in three files:

- `src/app/dashboard/board-batch.tsx:33` ("About Select")
- `src/app/dashboard/settings/desktop-notify-section.tsx:161`
- `src/app/dashboard/booths/setting-row.tsx:34`, which wraps it for booth settings

`SettingRow` is used in `booth-form.tsx` (three rows), `booth-limits-section.tsx`, `payment-section.tsx` and `printing-section.tsx`. So the booth form is partly covered. The settings page also has hints on auto-clear and Telegram. The real gaps:

| Where                                    | Add a hint that explains                                            |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Booth form, Hours & availability         | What "open" means to a customer, and that hours can differ per day. |
| Booth form, Name & photo                 | Where the name and photo appear (booth page, QR poster).            |
| Booth form, Pickup (self-checkout kiosk) | What the kiosk is and when a vendor would want it.                  |
| Booth form, Social links                 | Where the links show.                                               |
| Board header                             | What the daily order number is, and when it resets.                 |
| TV display, empty state                  | What a customer sees here and how the vendor opens it.              |
| Menu editor, option groups               | Group vs choice, and the required toggle.                           |
| Walk-up order dialog                     | When to use it instead of the QR.                                   |

Rules for new hints: one or two sentences, plain words, say what the setting does and when to turn it on. No jargon from the code.

### 4.2 Onboarding tour and checklist

`src/components/tour/tour-steps.ts` holds the tours. The orders-board tour has several steps (desktop and mobile variants). The **booths tour has one step**: "Start here", anchored on New booth (`tour-steps.ts`, `BOOTHS`). That text also tells the vendor Menu is required and the rest is optional.

Keep the booths tour short. The setup checklist (section 3.1) does the long carrying. The tour then points at the checklist instead of repeating it. Tour copy stays under two sentences per step.

### 4.3 User guide

The help center is `/dashboard/help` (`src/app/dashboard/help/`). It has eight categories in `src/content/help/categories.ts`:

1. Getting started
2. Running a service
3. Menu and stock
4. Payments
5. Printing
6. Customer alerts
7. Plans
8. Troubleshooting

Each journey step should link to one help article. The checklist and the "More settings" disclosure carry those links.

| Journey step               | Link to           |
| -------------------------- | ----------------- |
| Create a booth             | Getting started   |
| Build the menu             | Menu and stock    |
| Connect payment            | Payments          |
| Go live, print the QR      | Getting started   |
| Run a service on the board | Running a service |
| Set up the TV display      | Running a service |
| Search past orders         | Running a service |
| Label printing             | Printing          |
| Telegram and alerts        | Customer alerts   |
| Something broke            | Troubleshooting   |

### 4.4 Video list

One video per core task. Target 60 to 90 seconds each. Screen recording on an iPad, voice over, no music. Each follows four to six beats.

| #   | Video                      | Length  | Beats                                                                                                                                           |
| --- | -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Create a booth             | 45-60 s | 1. Tap New booth. 2. Name and photo. 3. Set hours and the open switch. 4. Save. 5. Land on the menu.                                            |
| 2   | Build the menu             | 60-90 s | 1. Add a category. 2. Add an item with price. 3. Add a photo. 4. Add an option group. 5. Save. 6. See the QR prompt.                            |
| 3   | Connect payment            | 60-90 s | 1. Open the Payment section. 2. Turn payment on. 3. Finish setup in paykit. 4. Return and confirm. 5. Place a test order.                       |
| 4   | Go live and print the QR   | 45-60 s | 1. Open the QR page. 2. Read the Go live card. 3. Print or save the poster. 4. Open the booth page. 5. Place one order and watch it land.       |
| 5   | Run a service on the board | 75-90 s | 1. Start service. 2. A new order arrives. 3. Advance it with one tap. 4. Mark paid. 5. Ready and pickup. 6. Auto-clear.                         |
| 6   | Set up the TV display      | 45-60 s | 1. Open the customer screen dialog. 2. Copy the link. 3. Open it on the TV. 4. Place an order. 5. Watch it move to Ready.                       |
| 7   | Search past orders         | 30-45 s | 1. Open Completed. 2. Type an order number. 3. Open the order. 4. Restore a cleared order.                                                      |
| 8   | Label printing             | 60-90 s | 1. Connect the printer. 2. Turn on Printing for the booth. 3. Check printer status. 4. Place an order. 5. Label prints. 6. Stick it on the cup. |

Rules: show the real UI with real data, name the exact button labels, and end each video on the next step ("now build your menu").

### 4.5 Discovery gap: shipped but unused

The 2026-09-10 AAR found that Manfred has not used three shipped features:

| Feature                  | Where                                           | Action                                                             |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------ |
| Label printer            | `src/app/dashboard/booths/printing-section.tsx` | Walk him through it before his next event. Video 8.                |
| Walk-up order entry      | `src/app/dashboard/walkup-order-dialog.tsx`     | Show the New order button. Board tour already mentions it.         |
| Daily order-number reset | `displayOrderNumber` in `src/lib/orders`        | Explain it to customers at pickup. Add a hint on the board header. |

This is an adoption problem, not an engineering one. Fix it with a call and a video, not new code. A "what's new" nudge on the board for unused features is worth considering later, but it is not proposed here.

## 5. Proposed implementation slices

None of these start without the owner's OK. Size: S is under a day, M is a few days, L is a week or more.

| #   | Slice                                            | Files (starting points)                                                                                                                 | Size | Why                                                                                                           | Checklist item |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Short create form plus "More settings" on edit   | `src/app/dashboard/booths/booth-form.tsx`, `new/page.tsx`, `use-booth-save.ts`                                                          | M    | Creating needs four fields. Eight sections slow and confuse a new vendor.                                     | 2, 6           |
| 2   | Setup checklist with next-step links             | `src/app/dashboard/page.tsx`, `board-empty-states.tsx`, `src/components/tour/tour-steps.ts`; new checklist component                    | M    | No screen shows the whole path. Vendors who stall have no way back in.                                        | 1, 3           |
| 3   | Seconds-level ready auto-clear option            | `src/lib/types.ts:73,95`, `src/lib/schemas.ts:525`, `settings/board-timing-section.tsx`, `components/board/use-auto-clear-countdown.ts` | S    | Manfred floated about 15 s. Today the floor is 1 minute. Confirm real sit time with him first.                | 1              |
| 4   | "Ready, check your phone" copy on the TV display | `src/app/order/[boothId]/display/queue-display.tsx` (Ready column, around line 286)                                                     | S    | Tells a customer what to do the moment their order is ready. Fewer "is mine ready?" questions at the counter. | 4, 1           |
| 5   | Investigate, then fix the "Saving..." hang       | `src/app/dashboard/booths/use-booth-save.ts:97-102`, `src/app/dashboard/booths/actions.ts` (`paymentPatch`, line 458)                   | S    | A stuck save in front of a new vendor kills trust. Reproduce by hand first.                                   | 1              |
| 6   | Hints across the booth form (see 4.1)            | `src/app/dashboard/booths/booth-form.tsx`, `setting-row.tsx`, `src/components/widgets/hint.tsx`                                         | S    | Explains settings where they are used. Cheap and low risk.                                                    | 3              |
| 7   | Record the eight videos (4.4)                    | None. Hosting and links to be decided, then linked from the checklist and `src/content/help/`.                                          | n/a  | Teaches the core tasks without a call. Not code.                                                              | 3              |

Notes on slice 3: the stored value is whole minutes with a 1 to 60 range (`src/lib/schemas.ts:525`). A seconds option means either a new column or a unit change. That touches the schema, so read `docs/CONSTITUTION.md` first and keep `supabase/migrations/` and `src/lib/types.ts` in step. Do not start it until Manfred gives a real sit time.

Suggested order if the owner approves: 5 (small, may be nothing), 4, 6, then 1 and 2 together, then 3 after the conversation with Manfred. Slice 7 can run in parallel at any point.
