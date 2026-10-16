// Browser side of the order-ready web push. Best-effort: every failure
// (unsupported engine, no service worker, permission not granted, push
// service refusal) returns null and the page keeps its chime and local popup.

/** Decodes a base64url VAPID public key into the bytes PushManager wants. */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// A first visit can still be installing the worker when the customer taps.
const ACTIVATE_WAIT_MS = 5000;

function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), ACTIVATE_WAIT_MS),
    ),
  ]);
}

/**
 * Subscribes this browser to push (or reuses its existing subscription) and
 * returns it as JSON for savePushSubscription. Call only after notification
 * permission is granted; it never prompts by itself.
 */
export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (
    !key ||
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return null;
  try {
    // getRegistration, unlike `ready`, resolves at once when none exists.
    const found = await navigator.serviceWorker.getRegistration();
    if (!found) return null;
    // subscribe() rejects without an active worker.
    const reg = found.active ? found : await activeRegistration();
    if (!reg) return null;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(key),
      }));
    return sub.toJSON();
  } catch {
    return null;
  }
}
