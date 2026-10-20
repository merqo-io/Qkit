import { z } from "zod";

// The push endpoint comes from the customer's browser, and the server later
// POSTs to it. Only the browsers' own push services are accepted, so a forged
// subscription cannot point the server at an arbitrary host.
const PUSH_HOST_EXACT = new Set(["fcm.googleapis.com"]);
const PUSH_HOST_SUFFIXES = [
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".push.apple.com",
];

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password)
    return false;
  const host = url.hostname;
  return (
    PUSH_HOST_EXACT.has(host) ||
    PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/);

/** A browser PushSubscription as serialised by `subscription.toJSON()`. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(1024).refine(isAllowedPushEndpoint),
  keys: z.object({
    p256dh: base64url(256),
    auth: base64url(64),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
