// Deliberately NOT a "use server" file. Every exported async function in a
// "use server" file becomes its own independently client-callable Server
// Action regardless of who actually imports it -- these two are only ever
// called from placeOrder (this dir's actions.ts) and finalizePaidOrder
// (order/[boothId]/[orderNumber]/finalize-paid-order.ts), never from a client
// component, so keeping them as plain functions removes that unintended
// public endpoint
// (an attacker who knows a real boothId -- visible in every /order/{boothId}
// URL -- could otherwise call notifyPrintkit directly with an arbitrary
// orderNumber/customerName, bypassing placeOrder's own validation and rate
// limit entirely).

// eslint-disable-next-line no-restricted-imports -- vendor alert runs for an anonymous customer order, outside any vendor session
import { createServiceClient } from "@/lib/supabase/server";
import { notifyVendor } from "@/lib/merqo/customer-notify";
import { createPrintJob } from "@/lib/printkit/client";
import { vendorFacingOrderNumber } from "@/lib/daily-order-number";

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

/**
 * Redundant new-order channel: alerts the booth's vendor via merqo's shared
 * Telegram bot (Phase A2 — supersedes qkit's own now-retired bot). Entirely
 * best-effort — the booth lookup reads via the service-role client (this
 * runs with no vendor session at all) and the whole thing is wrapped so
 * nothing here can ever affect placeOrder's own returned result. See
 * docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md.
 */
export async function notifyVendorTelegram(
  boothId: string,
  orderNumber: string,
): Promise<void> {
  try {
    const service = await createServiceClient();

    const { data: booth } = await service
      .from("booths")
      .select("vendor_id")
      .eq("id", boothId)
      .maybeSingle();
    if (!booth) return;

    const { data: order } = await service
      .from("orders")
      .select("total_cents")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .maybeSingle();
    const totalLabel = order
      ? ` · $${(order.total_cents / 100).toFixed(2)}`
      : "";

    // The ticket's number, not the permanent one: the alert read "#0847" for
    // a ticket on the board reading "#002".
    const shown = await vendorFacingOrderNumber(
      service,
      booth.vendor_id,
      boothId,
      orderNumber,
    );

    await notifyVendor(booth.vendor_id, `New order #${shown}${totalLabel}`);
  } catch (err) {
    console.error("notifyVendorTelegram failed", errorName(err));
  }
}

/**
 * Fires a printkit job-creation call for this order — best-effort, same
 * never-affects-the-result contract as notifyVendorTelegram above. Does its
 * own orders.id lookup: place_order's RPC output has no order id (only
 * order_number/booth_id/access_token — see
 * supabase/migrations/0075_place_order_customer_phone.sql), and printkit's
 * print_jobs.source_ref needs the real id (globally unique), not
 * order_number (only unique per booth_id). Gated on the booth's own
 * print_enabled — a vendor who hasn't opted in never fires this call.
 *
 * On a successful job creation, also marks this order's own print_status
 * 'queued' — without this, print_status stays 'not_required' for the
 * entire in-flight window (printkit only calls back on a TERMINAL status,
 * printed/failed — see Task 3's updatePrintJobStatus), which would make
 * the column lie about a job that's genuinely in progress. Best-effort,
 * same fire-and-forget contract as the createPrintJob call itself.
 */
export async function notifyPrintkit(
  boothId: string,
  orderNumber: string,
): Promise<void> {
  try {
    const service = await createServiceClient();
    const { data: booth } = await service
      .from("booths")
      .select("vendor_id, print_enabled")
      .eq("id", boothId)
      .maybeSingle();
    if (!booth) {
      console.error("notifyPrintkit: booth lookup found nothing");
      return;
    }
    if (!booth.print_enabled) return;

    const { data: order } = await service
      .from("orders")
      .select("id, customer_name")
      .eq("booth_id", boothId)
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (!order) {
      console.error("notifyPrintkit: order lookup found nothing");
      return;
    }

    // Print the SAME number the vendor's board, the TV display, and the
    // customer's own status page all show. Printing the raw permanent number
    // here would hand the customer a ticket whose last digit doesn't match
    // anything staff or the customer see on screen, breaking a physical
    // pickup-shelf-slot workflow keyed on it.
    const labelOrderNumber = await vendorFacingOrderNumber(
      service,
      booth.vendor_id,
      boothId,
      orderNumber,
    );

    const result = await createPrintJob({
      vendorId: booth.vendor_id,
      orderId: order.id,
      boothId,
      // The order's own stored name, not the caller's argument -- placeOrder
      // passes the same value it just wrote, but a caller-controlled string
      // would let anyone who knows a real (boothId, orderNumber) pair print
      // arbitrary text under that order's identity.
      customerName: order.customer_name,
      orderNumber: labelOrderNumber,
    });

    // printkit keeps one job per order id and answers 409 to a repeat, so a
    // second call for the same order prints nothing. That makes this function
    // safe to run again for an order (the payment callback and the customer's
    // own claim can both reach it). On a 409, fall through to the guarded
    // write below: it repairs a first call that died before marking the order
    // queued, and changes nothing otherwise.
    if (!result.ok && result.status !== 409) {
      console.error("notifyPrintkit: createPrintJob failed", result.status);
      return;
    }

    // Conditioned on the order still being in its pre-print state so a
    // genuine terminal status from the print-status callback route (which
    // may land inside the tiny race window before this write runs) can
    // never be overwritten back to 'queued'.
    const { error: updateError } = await service
      .from("orders")
      .update({
        print_status: "queued",
        print_status_updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("print_status", "not_required");
    if (updateError) {
      console.error("notifyPrintkit: print_status update failed");
    }
  } catch (err) {
    console.error("notifyPrintkit failed", errorName(err));
  }
}
