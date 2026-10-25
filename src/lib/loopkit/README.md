# loopkit

## Purpose

qkit's one read of loopkit data: whether a vendor offers stamps for qkit orders.

## Contents

- `earn-offer.ts`: `getEarnOffer(vendorId)` calls loopkit's `qkit_earn_offer(uuid)` RPC (loopkit migration `0062`, service role only) on the `loopkit` schema with the service client, and returns `{ enabled, program_name? }`. Fails closed to `{ enabled: false }` on an RPC error, a malformed answer or a thrown error, so the order page never breaks over it.
- `earn-offer.test.ts`: the schema and RPC name, a good answer, malformed answers, an RPC error and thrown errors.

## Connectivity

Used by the order status page's `EarnLink`. Needs loopkit's migration `0062` applied on the shared project; without it the link simply does not show.

## Parent

[lib](../README.md)
