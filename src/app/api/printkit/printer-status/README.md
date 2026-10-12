# printer-status

## Purpose

`GET /api/printkit/printer-status?booth=<booth id>` — the booth settings page
asking printkit whether this booth has a printer and whether it is reachable
right now.

It exists for one reason: `PRINTKIT_KIT_SECRET` is server-only, so the page
cannot call printkit itself without shipping that secret to the browser.

## Contents

- `route.ts` — `GET`. Requires a signed-in vendor, validates the booth id as
  a UUID, and reads the booth through the vendor's own session client, so
  qkit's RLS decides whose booth it is: another vendor's booth is a 404, not
  a printkit call. Then delegates to `getPrinterStatus`
  (`@/lib/printkit/client`). The answer is the client's own, `manage_url`
  included, plus `reachable: true`.

  A printkit failure answers `200` with `{printer: null, reachable: false}`
  rather than an error status. The difference matters in the UI: "we can't
  check right now" is not the same message as "this booth has no printer",
  and only one of them should worry a vendor mid-service.

- `route.test.ts` — signed-out, malformed booth id, another vendor's booth,
  the happy path, and the unreachable-printkit degrade.

## Parent

[printkit](../README.md)
