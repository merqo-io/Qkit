# Printing stage gate for the NCS rehearsal

Confirmed by Clarence on 2026-10-27: payment orders print only after payment confirmation; non-payment orders print only after vendor Start.

| Action                                                      | Payment order                           | Non-payment order                 |
| ----------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| Place QR or walk-up order                                   | No label                                | No label                          |
| Customer claims payment                                     | No label                                | Not applicable                    |
| Customer confirms arrival                                   | No label                                | No label; vendor still taps Start |
| Vendor confirms payment / trusted Paykit confirmed callback | Queue one label                         | Not applicable                    |
| Vendor Start                                                | Only eligible once payment is confirmed | Queue one label                   |
| Ready / pickup / cancel                                     | No new trigger                          | No new trigger                    |

Printing must be enabled on the booth. Terminal orders do not queue labels. A staff-entered walk-up explicitly marked already paid uses the same stored-confirmation gate. The current walk-up dialog records payment afterwards.

## Owner-controlled rollout

No Vercel or Supabase changes were made by the agent. Review the app patch and migration together. Apply `0107_printing_requires_vendor_start.sql` to staging before deploying the app patch there, then rehearse before approving production. Deploying the app without the migration would leave non-payment orders already preparing with no new Start transition to trigger printing.

The migration adds a private BEFORE INSERT trigger. It does not rewrite existing orders, change columns or expose a new client RPC, so the TypeScript database interface is unchanged. It preserves payment fulfillment state and existing non-printing behavior. SQL regressions target disposable CI databases; the agent runs no local or remote Supabase command.

## Staging acceptance

1. Printing-enabled non-payment QR and walk-up orders both wait for Start; zero queued labels before Start. Start each and verify exactly one physical label.
2. For an arrival-gated non-payment booth, tap the customer's arrival button. Verify no label, then vendor Start and one label.
3. Create a retail payment order, submit a claim/photo, and verify no label. Confirm payment from the vendor board and verify one label. Exercise both Mark paid & start and confirmation on an already preparing order.
4. Repeat confirmation/callback delivery and double-tap Start: Printkit should retain one job for the order UUID. Check the printed daily number against the board and customer page.
5. Disable printing and repeat; no label. Cancel an unconfirmed order and replay its callback; no label.
6. Disconnect Printkit and confirm/start an eligible order; the business action must still succeed. Inspect the failure before retrying. A retry cannot overwrite an already terminal printed/failed callback state.

Physical hardware, cross-kit staging behavior and migration execution remain pending owner testing. Existing queued/printed labels are not recalled, and undoing Start does not retract a print request. Printkit deduplication prevents a second label after undo and Start again. There is no durable automatic retry worker in this patch; a failed print request needs an eligible confirmation retry or separate operational recovery.

Manfred's proposed printer trial stays separate from the 200-cup NCS acceptance until he chooses to include it. This patch supports both order kinds per Clarence's rule; hardware is not a prerequisite for the event rehearsal.
