# NCS readiness for 6 November 2026

## Scope and release order

Manfred reported on 25 October that the next NCS test is 6 November, for
200 cups, with his Ops lead operating the system. He also reported customers
sharing an order number, requested a smaller paid-retail printing trial, and
asked how web notifications work for customers.

Prioritize number identity, safe retry and the printer-free NCS workflow before
the broader Phase 5 observability and Phase 6 database work. This document is a
test plan, not a record of a successful event rehearsal. All live rows below
are pending. The owner controls database changes and deployments.

1. Review and test the order-number/retry patch locally.
2. Deploy the reviewed candidate to an isolated staging Preview, recording its
   commit and the versions of the sibling staging apps.
3. Run the matrix below with synthetic customers. Record failures and fix them
   before repeating the affected cases.
4. Have the Ops lead run the rehearsal with minimal coaching.
5. Release only after the owner reviews the evidence. Apply any future
   backward-compatible database prerequisites before deploying dependent code;
   destructive changes require a later release. This patch has no migration.

## Investigation: what is established

The source contains a unique `(booth_id, order_number)` constraint and an
atomic per-booth counter. Customer tracking requires the booth, permanent
number and order token together. This does not verify the deployed schema or
prove what happened at Manfred's event.

Two different numbers exist: the permanent order number in the tracking URL
and the daily display number shown on the ticket. Daily display numbers repeat
across booths and dates by design. A shared complete tracking link opens the
same order; it does not place a second order.

Confirmed by local regression tests: at the lifetime counter boundary, text
ordering selected `10000` ahead of `9999`. A customer whose first number was
`001` could keep that heading while the next customer also saw `001`. The
patch selects the numeric minimum, keeping tracking and board baselines aligned
and covering pagination. There is no evidence that this was Manfred's cause.

Confirmed in source: two lost responses leave an unresolved request key for
same-details recovery. The previous copy incorrectly asserted the order had
not gone through. The patch says its outcome is unconfirmed. Do not expire or
replace an unresolved key blindly: the server might already have saved it.

Still hypotheses: a shared/copied browser session recovering the same attempt,
two people opening one tracking link, old receipts, different booths, or a
daily-boundary display mismatch. Do not mark the incident resolved solely on
the counter-boundary regression.

## Number incident capture

The Ops lead should record the following before replacing a disputed cup,
without delaying service. Replacing a cup is a service decision, not proof of
a software cause.

- Booth, date and Singapore time, displayed number on each phone, and the
  corresponding board number. Note the number of distinct board cards.
- Whether each person actually submitted an order or opened an existing link.
  Note shared devices, duplicate tabs, bookmarks and shared tracking links.
- The tracking path from each phone (booth and permanent number). Remove the
  entire `?t=...` query: it is a credential. Never paste tokens into logs,
  this document, screenshots or public issues.
- Compare ordered items and placement times privately. If paths match, an
  owner can compare the underlying order IDs through authorized tooling.
  Matching numbers alone do not establish duplicate database rows.
- Record signal loss, retry messages, board connection warnings, changes to
  numbering settings and service resets near the incident.

Keep any personal evidence in the owner's restricted support channel, with
customer details and bank screenshots omitted from repository fixtures.

## Staging test matrix

| Case                   | Exercise                                                                                     | Pass condition                                                                                                                           | Status                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Independent customers  | Two separate devices order the same drink under the same test name                           | Distinct orders, permanent numbers and tracking destinations; each phone matches its own board card                                      | Pending                                       |
| Burst                  | Submit concurrent requests from multiple independent devices/sessions                        | Every accepted order has a unique booth/permanent-number pair; rejected requests give an honest recoverable error; no lost accepted rows | Pending                                       |
| Double tap             | Tap Place order repeatedly while the request is slow                                         | One logical order and one destination for the attempt                                                                                    | Pending                                       |
| Lost response          | Interrupt the response after server acceptance, then retry the same details on the same page | Recover the original order; no second logical order; copy admits the outcome was unconfirmed                                             | Pending                                       |
| Recovery after refresh | Refresh with an unresolved request, then re-enter the same details                           | Recover the same attempt; changed details cannot silently reuse it                                                                       | Pending                                       |
| Shared device          | Reopen an unresolved attempt or recent receipt on a shared device                            | Staff can distinguish recovery/viewing from a new order; no claim that a second order was placed without evidence                        | Pending                                       |
| Wrong tracking token   | Open an order path with a different test order's token                                       | No other customer's order is disclosed                                                                                                   | Pending                                       |
| Daily baseline         | Complete/cancel the first orders, reconnect the board, reload tracking                       | Later live numbers remain aligned across phone, board and TV                                                                             | Pending                                       |
| Lifetime boundary      | Fixture crosses `9999` to `10000` on the same SGT day                                        | Baseline remains `9999`; headings progress from `001` to `002`                                                                           | Local regression passed; live fixture pending |
| Dates and booths       | Compare old receipts, two booths and an order across midnight SGT                            | Booth/date identity is understandable; a repeated daily number is not mistaken for the same order                                        | Pending                                       |
| Start new service      | Use the supported service-reset control between sessions                                     | Cup-cap behavior resets as intended; permanent order numbers are not reused                                                              | Pending                                       |
| Shared venue Wi-Fi     | Repeat a realistic burst behind one public IP, then on independent mobile connections        | Valid venue traffic is not unexpectedly blocked; measure the existing limits before changing policy                                      | Pending                                       |
| Last available cups    | Competing baskets request the remaining cups                                                 | Accepted quantities never exceed the configured cap; sold-out/refused orders are clear                                                   | Pending                                       |
| Fulfillment            | Accept, prepare, mark ready, collect; cancel and undo where supported                        | Correct board card changes; matching phone and TV update; payment state remains independent                                              | Pending                                       |
| Offline recovery       | Disconnect customer and board separately, then reconnect                                     | Stale/disconnected state is honest; accepted orders reconcile without duplicate tickets                                                  | Pending                                       |

The current action limiter permits 8 submissions per IP/booth code per minute,
and SQL contains a separate booth limiter. Retries also use requests. A shared
venue Wi-Fi test is necessary; do not disable abuse controls to make a load
test pass. Use staging and coordinate test traffic with the owner.

## 200-cup rehearsal and Ops lead handoff

Use the intended NCS booth mode, no online payment and printing disabled,
subject to Manfred confirming that configuration. Start with a known empty
synthetic dataset and cap of 200. One example mix is 160 one-cup orders and
20 two-cup orders: 180 orders, 200 cups. Include different drinks/modifiers.
Distinguish orders from cups when reconciling totals.

Run a small burst first, then the full mix at an agreed event pace. Include
two independent customer devices, venue Wi-Fi, a staff device and the TV if
used. Reconcile accepted items, served items, cancellations and remaining
capacity; test refunds/cancellations separately if they affect cup accounting.
Do not use real customers, payments or physical printer hardware for this
automated rehearsal.

The Ops lead must be able to open the booth, find an order, explain a customer
status, recover from a retry, mark ready/collected and handle a sold-out item
without the developer operating the screen. Record time to notice new orders,
wrong-ticket actions, questions and recovery steps. Agree acceptable response
times and the service fallback with Manfred before declaring a pass.

## Separate printing and notification checks

Printing stays out of the NCS readiness dependency. Clarify whether Manfred's
"paid orders only" means retail orders with a price, or printing only after
payment confirmation. Do not change the print trigger until he answers.
First use a virtual printer to test one job, payment confirmation, duplicate
callbacks, disconnect/retry and fulfillment/payment independence. Any physical
printer trial is owner-operated on the actual supported device/browser.

Demonstrate notifications on actual customer devices: permission accepted and
denied, page foreground/background, screen locked and the page closed. Verify
the actual supported behavior rather than promising that every browser receives
a background alert. Refusal or unsupported push must leave order tracking usable.
Use the same scenarios to decide whether the Ops lead needs a board sound,
desktop notification or vendor Telegram alert; none should be assumed enabled.

## Evidence needed for event readiness

- Reviewed candidate commit and sibling staging versions recorded.
- Matrix completed, with unresolved incident hypotheses explicitly listed.
- 200-cup totals reconciled and no unexplained same-booth number collision.
- Ops lead rehearsal completed; Manfred accepts the printer-free NCS setup.
- Staff fallback and incident capture understood before doors open.
- Notification behavior demonstrated; physical printing remains a separate trial.

Passing mocked tests is not a concurrency, browser, device or event-scale pass.
