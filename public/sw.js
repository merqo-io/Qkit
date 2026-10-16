// Minimal service worker for qkit. It does NOT cache anything (no offline /
// stale-asset risk) — its only jobs are to (a) control open pages so the order
// page can call registration.showNotification (the only notification form
// Android Chrome allows), (b) show the server's "order ready" web push while
// the page is suspended (src/lib/push/send.ts), and (c) focus/open the order
// on notification click.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Claim already-open tabs so navigator.serviceWorker.controller is set without
  // a reload — fireReadyNotification gates on that.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    return;
  }
  if (
    !payload ||
    typeof payload.title !== "string" ||
    typeof payload.body !== "string"
  ) {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Same tag as the page's own popup, so an open tab shows one, not two.
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      data: { url: typeof payload.url === "string" ? payload.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target;
  try {
    const url = event.notification.data?.url;
    target = new URL(typeof url === "string" ? url : "/", self.location.origin);
  } catch {
    return;
  }
  if (
    target.origin !== self.location.origin ||
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  ) {
    return;
  }
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (client.url === target.href && "focus" in client) {
          try {
            // Client.url can remain stale after an app changes routes.
            const destination = client.navigate
              ? await client.navigate(target.href)
              : client;
            if (destination) {
              await destination.focus();
              return;
            }
          } catch {
            // A closing tab must not prevent opening the order elsewhere.
          }
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target.href);
    })(),
  );
});
