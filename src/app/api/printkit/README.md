# printkit

## Purpose

Endpoint the sibling printkit product calls into: the inbound half of the
qkit↔printkit print-job integration (the outbound half — qkit creating a
print job — is `@/lib/printkit/client.ts`, not a route). Machine-to-machine
(no user session).

## Contents

- `print-status/` — `POST` endpoint printkit calls with a print job's
  terminal status; see its own README.
- `printer-status/` — `GET` endpoint qkit's own booth page calls to ask
  printkit whether a booth has a printer and whether it is reachable. The
  answer also carries `manage_url`, the printkit page for that booth's
  printer. It runs
  the other way round from `print-status/`: qkit is the caller here. It
  exists so the `PRINTKIT_KIT_SECRET` stays on the server, and it answers
  `{printer: null, reachable: false}` rather than an error when printkit
  cannot be reached, so an outage reads as "can't check right now" instead of
  "no printer".

## Connectivity

The callback route is guarded by `printkitCallbackBearerOk(request)` from
`@/lib/qkit-printkit-auth` — a plain shared-secret bearer check against
`PRINTKIT_CALLBACK_SECRET`, no `kit_slug:` prefix (unlike `PAYKIT_KIT_SECRET`
in `../../../lib/paykit/client.ts`), since this endpoint has exactly one
caller (printkit). Writes land on `orders.print_status`/
`print_status_updated_at` via `createServiceClient()`, surfaced on the
dashboard board as `PrintBadge` in `@/components/board/order-card.tsx`.

The printer-status route instead requires the signed-in vendor and an owned
booth before calling Printkit; it exposes no machine secret to the browser.

## Parent

[api](../README.md)
