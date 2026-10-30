# Multi-drink label implementation notes

## Goal

A no-payment order produces one label per drink after the vendor starts it. Payment orders remain gated on confirmed payment. The physical staging test uses a three-drink order and checks that no labels appear before the trigger and three appear afterward.

## Current behavior

Qkit persists each order line's quantity but notifyPrintkit reads only the order ID, name, fulfillment status and payment status. Its Printkit request contains one source reference and one label payload per order. Printkit enforces uniqueness on (source_kit, source_ref) and callbacks identify the order by that reference. The Bluetooth bridge, Pi agent, CloudPRNT and Feie paths currently produce one label per job.

## Implementation requirements

- Sum validated quantities from the persisted order snapshot, not client-controlled input. Define how non-drink items and empty walk-up orders are handled before interpreting every line as a drink.
- Preserve the existing payment/Start gates and idempotency. A retry must not create duplicate labels.
- Keep a single order-level status truthful when a multi-label print partially succeeds, fails, or loses its acknowledgement. Do not treat the first successful label as success for the whole order.
- Support each relevant connector explicitly. Bluetooth accepts a quantity argument, Feie sends times=1, CloudPRNT serves one image, and the Pi agent uses quantity=1; changing the payload alone does not make them print multiple labels.
- Remain compatible with previously queued single-label jobs and existing integrations. Validate and bound quantities at the server boundary.
- Test mixed item quantities, ordering triggers, repeated dispatch, partial failure, reconnect/retry, callbacks, and connector-specific delivery. Then run the staging physical test with the intended printer.

## Open physical-test detail

The actual printer model and connector are not yet known. Confirm these when the owner is available; the prior virtual printer is not physical hardware.

## Implementation candidate

The full reviewed contract and staging checklist are in [the specification](../superpowers/specs/2026-10-29-multi-drink-labels.md). Qkit now reads stored `items`, expands every unit (maximum 100) and sends a `label_batch` request. Empty snapshots do not print; invalid snapshots fail without dispatch. The existing Start/payment gates and displayed order number remain authoritative.

The initial classification default is one label for every item unit, including food, because persisted order items have no drink classification. This is explicit rather than guessing from menu names. Mixed-menu use needs acceptance of this default or a follow-up product field.

Printkit implements batches as atomic ordinary child jobs, each retaining the existing connector's quantity of one. Aggregate callbacks retain the order UUID and cannot report printed while a sibling is failed or pending. Migration 0011 is prepared in the isolated Printkit branch; it is not applied. Existing legacy single-label jobs are preserved rather than converted/reprinted. Physical testing remains pending on the intended device.
