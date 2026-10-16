# public

## Purpose

Static assets served as-is by Next.js from the site root.

## Contents

- `seed/` — placeholder menu-item images used by the demo/seed booth data.
- `sw.js` — the app's service worker. It caches nothing; it claims open tabs on activation, shows the server's order-ready web push (`push` event, payload `{title, body, url, tag}`; malformed payloads show nothing) and, on notification clicks, navigates and focuses the matching target tab or opens the notification URL. Navigation accepts only same-origin HTTP(S) URLs without embedded credentials; a closed or unfocusable matching tab falls back to opening the target.

## Connectivity

`seed/` images are referenced by `supabase/seed/*.sql` seed data and rendered in the menu UI. `sw.js` is registered by `ServiceWorkerRegistrar` (`src/components/service-worker-registrar.tsx`), which gates real notifications (`Android Chrome` only allows `registration.showNotification`, not the page-level `Notification` constructor).

## Parent

[qkit](../README.md)
