import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/server";

// Server-only. Reads order_push_subscriptions (service-role only, migration
// 0105) and sends each the "ready" notification saved when the customer
// subscribed.

// A ready alert that arrives an hour late is noise, not help.
const PUSH_TTL_SECONDS = 3600;

function vapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "";
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

function statusCodeOf(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("statusCode" in err))
    return null;
  return typeof err.statusCode === "number" ? err.statusCode : null;
}

/**
 * Fire-and-forget: pushes "your order is ready" to every browser the customer
 * subscribed for this order. Never throws, so the vendor's Mark Ready result
 * never depends on it. A subscription the push service reports gone (404/410)
 * is deleted; any other failure is logged and the row kept.
 */
export async function sendOrderReadyPush(orderId: string): Promise<void> {
  const vapid = vapidDetails();
  if (!vapid) return;
  try {
    const supabase = await createServiceClient();
    const { data: rows, error } = await supabase
      .from("order_push_subscriptions")
      .select("id, endpoint, p256dh, auth, title, body, url, tag")
      .eq("order_id", orderId);
    if (error || !rows) {
      console.error("sendOrderReadyPush: read failed", error?.message);
      return;
    }
    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            JSON.stringify({
              title: row.title,
              body: row.body,
              url: row.url,
              tag: row.tag,
            }),
            { vapidDetails: vapid, TTL: PUSH_TTL_SECONDS, urgency: "high" },
          );
        } catch (err) {
          const code = statusCodeOf(err);
          if (code === 404 || code === 410) {
            await supabase
              .from("order_push_subscriptions")
              .delete()
              .eq("id", row.id);
            return;
          }
          // The endpoint is a capability URL; log the status, never the URL.
          console.error("sendOrderReadyPush: send failed", code);
        }
      }),
    );
  } catch (err) {
    console.error(
      "sendOrderReadyPush failed",
      err instanceof Error ? err.message : err,
    );
  }
}
