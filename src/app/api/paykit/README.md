# paykit

## Purpose

Endpoint the sibling paykit product calls into: the inbound half of the
qkit↔paykit payment integration. The outbound half, qkit asking paykit for a
checkout or a status, is `@/lib/paykit/client.ts`, not a route.
Machine-to-machine (no user session).

## Contents

- `payment-status/` — `POST` endpoint paykit calls after a payment's status
  changes; see its own README.

## Connectivity

Guarded by `paykitCallbackBearerOk(request)` from `@/lib/qkit-paykit-auth`: a
plain shared-secret bearer check against `PAYKIT_CALLBACK_SECRET`, with no
`kit_slug:` prefix, since paykit is the only caller. It is a different secret
from `PAYKIT_KIT_SECRET`, which authenticates qkit's own calls to paykit.

## Parent

[api](../README.md)
