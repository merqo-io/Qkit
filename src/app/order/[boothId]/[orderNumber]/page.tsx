import { notFound, redirect } from "next/navigation";
import { requestOrigin } from "@/lib/request-origin";
import Link from "next/link";
import dynamic from "next/dynamic";
import QRCode from "react-qr-code";
// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServiceClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  type VendorProfile,
} from "@/lib/merqo/vendor-profile";
import { Ticket } from "@/components/widgets/ticket";
import {
  cn,
  formatOptions,
  formatPrice,
  orderHasPricing,
  EYEBROW_CLASS,
} from "@/lib/utils";
import {
  orderBoothIdSchema,
  orderNumberSchema,
  orderTokenSchema,
  parseOrderItems,
  parseSocialLinks,
  resolveSocialLinks,
} from "@/lib/schemas";
import { isStaleOrderView, isTerminal } from "@/lib/orders";
import { resolveOrderDisplay } from "@/lib/order-display";
import { shortDateTime } from "@/lib/tz";
import { FeedbackForm } from "@/components/widgets/feedback-form";
import { ReorderButton } from "@/components/order/reorder-button";
import { OrderStatusPoller } from "./order-status-poller";
import { EarnLink } from "./earn-link";
import { TelegramConnect } from "./telegram-connect";
import { SocialLinksRow } from "@/components/widgets/social-links-row";

// showPay is false for most orders (queue-only booths, or once payment is a
// moot point), so PayPanel shouldn't ship in every order-status page's JS.
const PayPanel = dynamic(() => import("./pay-panel").then((m) => m.PayPanel));

const PAST_STAMP: Record<"completed" | "cancelled" | "stale", string> = {
  completed: "Collected",
  cancelled: "Cancelled",
  stale: "Past order",
};

/**
 * The mark on an order that is over: a stamp saying how it ended, and the date
 * and time, in full. Both are there so that staff handed this screen can see at
 * a glance that it is not today's order, and a customer cannot present last
 * week's receipt as a current one.
 */
function PastOrderStamp({
  status,
  placedAt,
  completedAt,
}: {
  status: string;
  placedAt: string;
  completedAt: string | null;
}) {
  let kind: keyof typeof PAST_STAMP = "stale";
  if (status === "completed") kind = "completed";
  else if (status === "cancelled") kind = "cancelled";
  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      <span
        className={cn(
          "inline-block -rotate-3 rounded-md border-2 px-4 py-1.5 font-display text-xl font-bold tracking-[0.18em] uppercase",
          kind === "cancelled"
            ? "border-status-cancelled text-status-cancelled"
            : "border-muted-foreground text-muted-foreground",
        )}
      >
        {PAST_STAMP[kind]}
      </span>
      <dl className="space-y-0.5 text-sm">
        <div className="flex justify-center gap-1.5">
          <dt className="text-muted-foreground">Placed</dt>
          <dd className="font-medium">{shortDateTime(placedAt)}</dd>
        </div>
        {kind === "completed" && completedAt && (
          <div className="flex justify-center gap-1.5">
            <dt className="text-muted-foreground">Collected</dt>
            <dd className="font-medium">{shortDateTime(completedAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// The top of the ticket: the number, who it is for, and where. A past order's
// number is struck through and stamped. A receipt that still looked live could
// be shown at the counter as today's order, and the daily number resets, so
// yesterday's #012 would be indistinguishable from today's without it.
function OrderHeader({
  number,
  customerName,
  boothName,
  past,
  status,
  placedAt,
  completedAt,
}: {
  number: string;
  customerName: string;
  boothName: string | undefined;
  past: boolean;
  status: string;
  placedAt: string;
  completedAt: string | null;
}) {
  return (
    <header className="px-6 pt-9 pb-6 text-center">
      <h1
        className={cn(
          "font-mono text-6xl leading-none font-bold tracking-tight",
          past &&
            "text-muted-foreground line-through decoration-muted-foreground/70 decoration-2",
        )}
      >
        #{number}
      </h1>
      <p className="mt-3 text-lg font-medium">{customerName}</p>
      <p className="text-sm text-muted-foreground">{boothName}</p>
      {past && (
        <PastOrderStamp
          status={status}
          placedAt={placedAt}
          completedAt={completedAt}
        />
      )}
      {/* Says what will happen, not just what to remember: at NCS every
          customer came back to the counter to ask whether theirs was ready,
          because nothing told them the page changes by itself. */}
      {!past && status !== "ready" && (
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          Keep this page open. It turns to Ready when your order is up.
        </p>
      )}
    </header>
  );
}

// What was ordered, with prices where the booth charges. The customer's own
// record of the order, so unlike the vendor's ticket it keeps every price.
function OrderLines({
  items,
  priced,
  totalCents,
  payAtCounter,
}: {
  items: ReturnType<typeof parseOrderItems>;
  priced: boolean;
  totalCents: number;
  payAtCounter: boolean;
}) {
  return (
    <section className="space-y-1.5 px-6 py-5">
      {items.map((item, i) => (
        <div key={i} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="min-w-0 break-words">
              <span className="font-mono text-muted-foreground">
                {item.quantity}×
              </span>{" "}
              {item.name}
            </span>
            {priced && (
              <span className="shrink-0 font-mono text-muted-foreground">
                {item.price_cents == null
                  ? "Free"
                  : formatPrice(item.price_cents * item.quantity)}
              </span>
            )}
          </div>
          {formatOptions(item.options) && (
            <p className="pl-5 text-xs text-muted-foreground">
              {formatOptions(item.options)}
            </p>
          )}
        </div>
      ))}
      {priced && (
        <div className="mt-1 flex justify-between border-t border-border/60 pt-3 font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatPrice(totalCents)}</span>
        </div>
      )}
      {payAtCounter && (
        <p className="pt-1 text-sm text-muted-foreground">
          Pay at the counter when you collect.
        </p>
      )}
    </section>
  );
}

interface Props {
  params: Promise<{ boothId: string; orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}

export const revalidate = 0;

/**
 * Vendor-level default social links, so a booth without its own override
 * still shows the vendor's. Unlike get-entitlement's fail-loud convention, a
 * failure here must NOT take down the page: this is a customer holding a
 * valid, paid order link, and the vendor-level links are a decorative
 * footer, not load-bearing — degrade to null (booth-only links, or none) on
 * any RPC error rather than throw.
 */
async function loadVendorProfile(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  vendorId: string,
): Promise<VendorProfile | null> {
  try {
    return await getOrCreateVendorProfile(supabase, vendorId, null);
  } catch (err) {
    console.error(
      "order-status: vendor profile read failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * A repeat customer's browser can restore an earlier visit's status URL, so
 * this page can be a live-looking view of an order served weeks ago (see
 * isStaleOrderView in @/lib/orders). The number shown is then that old order's
 * permanent one, which will not match the number the vendor is calling, and
 * marking today's order ready changes nothing on it.
 *
 * Kept out of the component body because reading the clock during render is
 * impure (react-hooks/purity), even in a server component that renders once
 * per request.
 */
function resolveStaleView(createdAt: string): boolean {
  return isStaleOrderView(createdAt, Date.now());
}

async function resolveOrigin(): Promise<string> {
  return (await requestOrigin()) ?? "https://qkit.example";
}

export default async function OrderStatusPage({ params, searchParams }: Props) {
  const { boothId, orderNumber } = await params;
  const { t: token } = await searchParams;

  // Validate the route params AND the per-order token before the query. booth_id
  // is not secret (it's in the URL a customer gets), and order numbers are short
  // sequential per-booth strings — the unguessable `token` is what authorizes the
  // read, so without a valid one there's nothing to show (closes the enumeration
  // of other customers' orders at the same booth).
  if (
    !orderBoothIdSchema.safeParse(boothId).success ||
    !orderNumberSchema.safeParse(orderNumber).success ||
    !token ||
    !orderTokenSchema.safeParse(token).success
  )
    notFound();

  // Service client bypasses RLS — customers are unauthenticated
  const supabase = await createServiceClient();

  // Both reads key only on the route params, so fetch them together instead of
  // serially (one round-trip of latency, not two) on this hot status page. The
  // order read also matches the token, so a wrong/guessed number returns nothing.
  const [{ data: order, error: orderError }, { data: booth }] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, booth_id, order_number, customer_name, items, status, total_cents, payment_status, payment_method_kind, paid_at, print_status, created_at, ready_at, completed_at, updated_at, source, auto_completed",
        )
        .eq("booth_id", boothId)
        .eq("order_number", orderNumber)
        .eq("access_token", token)
        .maybeSingle(),
      supabase
        .from("booths")
        .select(
          "name, vendor_id, social_links, requires_arrival_confirm, pickup_scan_enabled",
        )
        .eq("id", boothId)
        .single(),
    ]);

  // A real read error must not masquerade as "order doesn't exist" — that's a
  // false 404 stranding a customer who holds a valid link during a DB/network
  // blip. Let the error boundary show a retryable error; only a genuine no-row
  // (maybeSingle → null, no error) is a true 404.
  if (orderError)
    throw new Error(`order status read failed: ${orderError.message}`);
  if (!order || order.order_number == null) notFound();

  // A still-unclaimed payment belongs on /pay, not here (stale bookmark guard).
  if (order.payment_status === "pending") {
    redirect(`/order/${boothId}/pay?t=${token}`);
  }

  // Vendor-level default links, so a booth without its own override still
  // shows the vendor's. Small extra query (not embeddable via Promise.all
  // above — it depends on booth.vendor_id) but this page isn't a hot path.
  const vendorProfile = booth?.vendor_id
    ? await loadVendorProfile(supabase, booth.vendor_id)
    : null;
  const socialLinks = resolveSocialLinks(
    booth?.social_links ? parseSocialLinks(booth.social_links) : null,
    parseSocialLinks(vendorProfile?.social_links ?? null),
  );

  const headingNumber = booth?.vendor_id
    ? await resolveOrderDisplay(
        supabase,
        boothId,
        booth.vendor_id,
        order.order_number,
      )
    : order.order_number;

  // Self-checkout pickup is set per booth (migration 0104).
  const pickupUrl =
    order.status === "ready" && booth?.pickup_scan_enabled === true
      ? `${await resolveOrigin()}/order/${boothId}/${orderNumber}?t=${token}`
      : null;

  const staleView = resolveStaleView(order.created_at);
  // A past order: one that is finished, or one reopened long after it was
  // placed whatever state it was left in. Either way it must not pass for a
  // live order at the counter.
  const past = staleView || isTerminal(order.status);

  const items = parseOrderItems(order.items);
  const priced = orderHasPricing(items);

  // Show the pay panel for any payment-expected, non-cancelled order (NOT
  // isTerminal: a completed order still shows PayPanel's "confirmed" state).
  const showPay =
    order.payment_status !== "not_required" && order.status !== "cancelled";
  // A priced order at a booth that takes no payment through qkit: the stall
  // collects in person, and nothing else on the page says so.
  const payAtCounter =
    order.payment_status === "not_required" && order.total_cents > 0 && !past;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-10">
      <Ticket shadow="lifted">
        <OrderHeader
          number={headingNumber}
          customerName={order.customer_name}
          boothName={booth?.name}
          past={past}
          status={order.status}
          placedAt={order.created_at}
          completedAt={order.completed_at}
        />

        <div className="perforation" />

        {/* Pay comes first, above status/progress — it's the customer's
            actual call-to-action while an order is unpaid, not passive
            information like "you're next in line". */}
        {showPay && !staleView && (
          <>
            <PayPanel
              boothId={boothId}
              orderNumber={orderNumber}
              token={token}
              initialStatus={order.payment_status}
            />
            <div className="perforation" />
          </>
        )}

        {staleView ? (
          <div className="space-y-3 px-6 py-7 text-center">
            <p className="font-display text-xl font-semibold text-balance">
              This is not today&apos;s order
            </p>
            <p className="text-sm text-balance text-muted-foreground">
              Your phone reopened an earlier one. It is kept here as a receipt
              and cannot be collected again.
            </p>
          </div>
        ) : (
          <OrderStatusPoller
            boothId={boothId}
            orderNumber={orderNumber}
            displayNumber={headingNumber}
            token={token}
            initialStatus={order.status}
            boothName={booth?.name ?? "Your order"}
            placedAt={order.created_at}
            // The kitchen status (pending→…→completed) and payment status
            // (pending→claimed→confirmed) advance independently — a vendor can
            // mark an order preparing/ready before the customer has paid. Don't
            // let the status text claim progress that implies payment is
            // settled when it isn't.
            awaitingPayment={showPay && order.payment_status !== "confirmed"}
            paymentSent={
              order.payment_status === "claimed" ||
              order.payment_status === "confirmed"
            }
            requiresArrivalConfirm={booth?.requires_arrival_confirm ?? false}
          />
        )}

        {/* The connect button only makes sense while the order is still
            waiting — once it's ready/completed/cancelled, there's nothing
            left to notify about, or the moment already passed. A stale view
            (staleView) is the same case: that order's moment passed weeks
            ago, and the one the customer is waiting for is a different row. */}
        {!staleView &&
          !isTerminal(order.status) &&
          order.status !== "ready" &&
          booth?.vendor_id && (
            <TelegramConnect orderId={order.id} vendorId={booth.vendor_id} />
          )}

        {/* Pulled up next to the status/ETA block rather than buried in the
            footer below items — a customer stares at this page for several
            idle minutes while waiting, and something to do (follow the
            booth) belongs near the thing they're already looking at, not
            past the transactional content. */}
        {Object.keys(socialLinks).length > 0 && (
          <div className="flex flex-col items-center gap-2 px-6 pb-6">
            <p className={EYEBROW_CLASS}>Follow {booth?.name}</p>
            <SocialLinksRow links={socialLinks} />
          </div>
        )}

        <div className="perforation" />

        <OrderLines
          items={items}
          priced={priced}
          totalCents={order.total_cents}
          payAtCounter={payAtCounter}
        />

        {pickupUrl && (
          <>
            <div className="perforation" />
            <section className="flex flex-col items-center gap-3 px-6 py-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Show this at the pickup counter to collect
              </p>
              <div className="rounded-xl bg-white p-4">
                <QRCode value={pickupUrl} size={180} />
              </div>
            </section>
          </>
        )}
      </Ticket>

      {/* Only once the order is done, not while still in progress — a
          request made mid-task is both more annoying and yields lower-
          quality responses than the same ask made after completion. */}
      {order.status === "completed" && (
        <div className="mt-6">
          <FeedbackForm
            source="customer"
            boothId={boothId}
            orderNumber={orderNumber}
            token={token}
            prompt="How was ordering here?"
          />
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pt-8">
        {order.status === "completed" && booth?.vendor_id && (
          <EarnLink orderId={order.id} vendorId={booth.vendor_id} />
        )}
        {items.length > 0 && (
          <ReorderButton
            boothId={boothId}
            // Client-safe lines only — cost_cents never leaves the server.
            lines={items.map((it) => ({
              menuItemId: it.menuItemId,
              quantity: it.quantity,
              options: it.options,
            }))}
            customerName={order.customer_name}
            label={past ? "Order this again" : "Reorder these items"}
            className="h-11 rounded-xl px-5"
          />
        )}
        <Link
          href={`/order/${boothId}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {items.length > 0 ? "Order something else" : "Order again"}
        </Link>
      </div>
    </div>
  );
}
