import { CustomerTelegramConnect } from "@merqo/ui";
import { mintCustomerConnectToken } from "@/lib/merqo/customer-notify";

/**
 * Server component, same shape as EarnLink: mints a single-order-scoped
 * Telegram connect token from merqo and renders the shared deep-link button,
 * or nothing on any mint failure: a merqo outage must never break the
 * order-status page. The disclosure text below is a one-line preview only;
 * the full consent copy lives in merqo's own connect flow, never restated
 * or diverged from here.
 */
export async function TelegramConnect({
  orderId,
  vendorId,
}: {
  orderId: string;
  vendorId: string;
}) {
  const connect = await mintCustomerConnectToken(
    vendorId,
    "qkit",
    `qkit:${orderId}`,
  );

  return (
    <CustomerTelegramConnect
      deepLink={connect?.deep_link}
      linkLabel="Get notified on Telegram when it's ready →"
      disclosure="Connects you to Merqo on Telegram, we'll message you here about your order, and about any Merqo kit you use going forward (never marketing, see merqo's disclosure page). You can block the bot any time."
    />
  );
}
