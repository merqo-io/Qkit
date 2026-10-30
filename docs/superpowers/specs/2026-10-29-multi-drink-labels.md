# Multi-drink labels

Status: implementation candidate, 29 October 2026. Migration is prepared, not applied. Physical verification is pending; the first staging candidate is Kopitiam Cart. The actual printer model and connector are unknown.

## Contract and defaults

Qkit reads the persisted order snapshot after its existing eligibility check. No-payment orders print only in `preparing`, after vendor Start. Payment orders require `payment_status=confirmed`; a customer claim is insufficient. Cancelled/completed orders do not dispatch. No new order-placement trigger is introduced.

An order containing 2 Kopi and 1 Tea creates 3 physical-label jobs. Each job retains the displayed order number and stored customer name, adds the item name, selected options, and a position such as `2/3`. Names/options are truncated for the small label; they are identification aids, not complete preparation instructions. Existing single-label payloads retain their layout.

The stored OrderItem has no drink/food classification. The explicit initial default is **one label for every item unit**, including food. Do not infer drink status from names or mutable menu categories. Empty walk-up orders produce no job and retain `not_required`. Drink-only filtering is deferred until there is an explicit snapshotted product classification. This default must be accepted before using this for a mixed food/drink menu.

Quantities must be positive integers. Maximum 100 units per order, 100 lines, item names 160 characters, options 240 characters in the outbound contract; the API bounds the entire request at 64 KiB. Invalid or oversized stored snapshots produce no jobs and Qkit marks its initial print status failed. There is no truncation of the number of labels and no partial acceptance of an oversized order.

## Durable representation and compatibility

`POST /api/v1/print-jobs` accepts a new `job_type: label_batch` with a nonempty `labels` array and the existing common `payload`, vendor, source and location fields. It returns the batch UUID under the existing `id` field. Legacy requests without `labels` keep their existing job ID, conflict response, callbacks and rendering. The distinct job type deliberately fails at an old deployment's DB constraint rather than letting it ignore the array and silently print one label.

Printkit migration 0011 adds a vendor-readable `print_batches` table and nullable `print_jobs.batch_id`. The service-only creation RPC inserts the batch and all child jobs in one transaction. Children are ordinary `label` jobs, each for exactly one unit; their internal source refs use the batch UUID and unit ordinal. The caller's original order UUID belongs to the batch and is the only source ref sent to Qkit callbacks.

An advisory transaction lock serializes the source namespace across batches and legacy inserts. A repeated identical batch request returns the same batch and children, dispatches only claimable queued children, and reconciles terminal batch status again. Changes to vendor, common payload or labels conflict with the immutable original snapshot (422). An existing legacy job returns 409 and is left intact; it is not retroactively expanded or printed again. Qkit retains its existing 409 handling for those previously dispatched orders. No new labels are created by repeating Start or a payment notification.

There is no parent job in a printer queue. Missing routing follows the existing unrouted-job behavior. The vendor can assign individual queued children in history; printed children are never requeued by batch submission. Claims, expiry, attempt tokens, and per-job manual reprint use the existing mechanisms.

## Completion, partial failure and retries

Batch status is computed under a batch row lock from all expected children. Any failed child makes the batch failed, all children printed makes it printed, and all other combinations remain queued. Missing children fail closed. Only terminal aggregate status is sent to Qkit, using the original order UUID; a child's success never marks the order printed by itself. Aggregate status transitions have a strictly increasing microsecond timestamp, preserving Qkit's existing out-of-order callback protection. Reprinting one failed child can move the batch back through queued to printed only when every child has succeeded.

No automatic reprint follows an ambiguous device/network acknowledgement. Physical printing is not transactional: if a label leaves the printer and its acknowledgement is lost, software cannot know whether it exists. The normal expiry/confirmation timeout fails the individual job; the operator must inspect the physical labels and explicitly reprint only missing ones. A reprint can create an extra physical label and is intentionally operator controlled. No exact-once physical-delivery claim is made.

Callbacks retain the existing best-effort HTTP transport. Batch resubmission reconciles and resends terminal aggregate callbacks without reprinting; there is no new durable callback outbox or background retry scheduler. A lost callback can leave Qkit queued/failed until reconciliation or another child transition. Printkit child history is the diagnostic source. A live callback recovery UI/outbox is a follow-up, not a guarantee of this candidate.

## Connector coverage

| Path                                | Batch delivery                                                                    | Acknowledgement                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Browser Bluetooth bridge / NIIMBOT  | Existing claim and rendered PNG path runs once for each child, quantity remains 1 | Existing bridge result per child and attempt                           |
| Raspberry Pi bridge agent / NIIMBOT | Existing polling loop fetches and prints each child, quantity remains 1           | Existing agent result per child and attempt; reconnect follows failure |
| Feie vendor cloud                   | Each child is independently claimed and submitted, `times=1` remains correct      | Existing maker callback or reconciliation per driver reference         |
| Star CloudPRNT                      | Each child is advertised, fetched as one PNG and confirmed independently          | Existing revision-bound CloudPRNT confirmation                         |
| Virtual development printer         | Same ordinary-job delivery contract                                               | Simulated acknowledgement only                                         |

The implementation preserves those protocols rather than relying on unsupported multi-copy commands or a tall image being cut into labels. This is code-path coverage, not hardware certification. Firmware, label feed/cutting, legibility, and the unknown owner's actual device still require physical verification. Child completion order need not equal ordinal order; ordinals identify units.

## Rollout and acceptance

1. Review and apply Printkit migration `0011_label_batches.sql` through the user's normal migration process. This session does not apply migrations or operate Supabase.
2. Ship Printkit migration/server together before enabling the Qkit caller in staging. Existing old callers continue sending legacy single-label jobs. Qkit before Printkit fails closed for new batches.
3. In Kopitiam Cart staging, confirm the exact printer/catalog entry/connector and label size. Connect only that intended printer. Do not infer support from the virtual test.
4. No-payment case: create 2 Kopi plus 1 Tea. Expect zero labels before Start, three after Start, matching displayed order number/name/item/options and `1/3` through `3/3`. Repeat the trigger; expect zero additional labels.
5. Payment case: expect zero labels at placement and payment claim; confirm payment, expect exactly the summed quantity. Repeat notification; expect zero additional labels.
6. Test a one-unit order, an empty walk-up order (zero labels), modifiers, a mixed food/drink order under the stated default, and long/CJK text. Check feed/cutting and readable content on the physical label.
7. Interrupt after one unit or simulate paper-out. Qkit must not show printed for an incomplete batch. Inspect child history, restore the device and explicitly reprint only known missing labels; acknowledge that ambiguous physical delivery requires inspection.
8. Check callback recovery and stale callback rejection. Keep production rollout pending these results. Do not merge/deploy this candidate to production on automated tests alone.

Automated validation includes snapshot expansion/gates, API bounds/version pairing, batch dispatch/aggregate callbacks, unchanged connector suites, Pi partial failure/reconnect, and the SQL regression runner. `node scripts/test-label-batches.mjs <PostgreSQL-bin-directory>` creates/stops a disposable local cluster, runs actual migrations with minimal auth fixtures, and checks atomicity, legacy conflicts, RLS, lifecycle and concurrent submission. It never connects to Supabase. Its temporary cluster is retained stopped for diagnosis.
