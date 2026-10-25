import { z } from "zod";
// eslint-disable-next-line no-restricted-imports -- anonymous customer flow; the order token or booth id is the credential
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import {
  parseMenuItems,
  parseMenuCategories,
  parseBoothHours,
  parseSocialLinks,
} from "@/lib/schemas";
import { isBoothOpen, nextOpenLabel } from "@/lib/hours";
import { parseRemaining } from "@/lib/stock";
import { parseAvailability } from "@/lib/availability";
import { expectsPayment, paymentKindOf } from "@/lib/payment-marker";
import { OrderForm } from "@/components/order/order-form";
import { RecentOrders } from "@/components/order/recent-orders";
import { ExpiredCode } from "@/components/order/expired-code";
import { MediaImage } from "@/components/widgets/media-image";
import { SocialLinksRow } from "@/components/widgets/social-links-row";

export const revalidate = 0;

interface Props {
  params: Promise<{ code: string }>;
}

// Shape returned by get_booth_for_order (public-safe; no cost_cents/short_code).
const boothForOrder = z.object({
  booth_id: z.string(),
  name: z.string(),
  image_url: z.string().nullable(),
  hours: z.unknown().nullable(),
  is_active: z.boolean(),
  servable: z.boolean(),
  menu_items: z.unknown(),
  menu_categories: z.unknown(),
  remaining: z.unknown(),
  social_links: z.unknown(),
});

/**
 * The booth's whole-basket limits: items left in its daily total
 * (booths.daily_cup_cap, migration 0094, which counts every item sold) and
 * the most items one order may carry (max_items_per_order, 0096). Either is
 * null when the booth does not set it.
 *
 * `left` here is the stock itself, with nobody's basket hold taken off. This
 * page cannot know which hold is the visitor's own, so subtracting them would
 * tell a customer who refreshes with the last items in their basket that the
 * stall is sold out. OrderForm applies holds once it knows its own.
 *
 * Read separately from get_booth_for_order so that RPC's public-safe shape
 * stays as it is, and degraded to "no limits" on any failure: the triggers
 * are the real limits, so a failure here costs a warning, never correctness.
 */
async function loadBasketLimits(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothId: string,
): Promise<{ left: number | null; maxPerOrder: number | null }> {
  try {
    const { data, error } = await supabase.rpc("booth_availability", {
      p_booth_id: boothId,
      p_session: null,
    });
    if (error) console.error("booth_availability failed", error.message);
    const availability = error ? null : parseAvailability(data);
    if (!availability) return { left: null, maxPerOrder: null };
    return {
      left:
        availability.left === null
          ? null
          : availability.left + availability.leftHeld,
      maxPerOrder: availability.maxPerOrder,
    };
  } catch {
    console.error("booth_availability request failed");
    return { left: null, maxPerOrder: null };
  }
}

/**
 * Whether the booth takes no payment through qkit, so a priced order is paid
 * in person, by the same `booths.payment` marker place_order reads (see
 * `@/lib/payment-marker`). The public booth RPC does not expose payment,
 * so this reads the one column server-side. On any failure it answers false:
 * the note is then missing, which is how the page looked before it existed.
 */
async function loadPaysInPerson(boothId: string): Promise<boolean> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("booths")
      .select("payment")
      .eq("id", boothId)
      .maybeSingle();
    if (error || !data) return false;
    return !expectsPayment(paymentKindOf(data.payment));
  } catch {
    return false;
  }
}

export default async function OrderEntryPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_booth_for_order", {
    p_short_code: code,
  });
  // A DB/RPC error is NOT the same as an unresolved code: the code may be valid
  // and telling the customer to rescan sends them in a loop. Log it and show the
  // transient-error screen instead of "QR expired".
  if (error) {
    console.error("get_booth_for_order failed", error.message);
    return <ExpiredCode variant="error" />;
  }
  const parsed = boothForOrder.safeParse(data);
  // null/unresolved code → hard block
  if (!parsed.success) return <ExpiredCode />;
  const booth = parsed.data;

  const available = parseMenuItems(booth.menu_items);
  const categories = parseMenuCategories(booth.menu_categories);
  const nowIso = new Date().toISOString();
  const hours = parseBoothHours(booth.hours);
  const open = isBoothOpen({ is_active: booth.is_active, hours }, nowIso);
  const reopen = open
    ? null
    : nextOpenLabel({ is_active: booth.is_active, hours }, nowIso);
  const { left: itemsLeft, maxPerOrder } = await loadBasketLimits(
    supabase,
    booth.booth_id,
  );
  const soldOutToday = itemsLeft === 0;
  const closed = !open || !booth.servable || soldOutToday;
  const remaining = parseRemaining(booth.remaining);
  // Three closed reasons, most specific first: the day's stock is gone, the
  // booth is paused, or it is simply outside opening hours.
  let closedTitle = "Closed right now";
  let closedDetail = `${reopen ?? "Not taking orders at the moment."} You can browse the menu below.`;
  if (soldOutToday) {
    closedTitle = "Sold out";
    closedDetail =
      "They have served everything they had. You can still browse the menu below.";
  } else if (!booth.servable) {
    closedTitle = "Not taking orders";
    closedDetail = "This booth isn't accepting orders right now.";
  }
  const socialLinks = parseSocialLinks(booth.social_links);
  const paysInPerson = await loadPaysInPerson(booth.booth_id);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 pb-28 pt-8 md:max-w-2xl">
      <div className="md:mx-auto md:max-w-lg">
        {booth.image_url && (
          <div className="relative mb-5 h-40 w-full overflow-hidden rounded-2xl border border-border">
            <MediaImage
              src={booth.image_url}
              alt=""
              fill
              preload
              sizes="(max-width: 640px) 100vw, 32rem"
              className="object-cover"
            />
          </div>
        )}
        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Order from
          </p>
          <h1 className="font-display mt-1 text-4xl font-semibold leading-[1.05] break-words">
            {booth.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order right here, no app, no account. Just add your name.
          </p>
        </header>
        <RecentOrders boothId={booth.booth_id} />
        {closed && (
          <div className="mb-7 rounded-xl border border-status-cancelled/30 bg-status-cancelled/10 px-4 py-3 text-center">
            <p className="font-display text-lg font-semibold text-status-cancelled">
              {closedTitle}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {closedDetail}
            </p>
            {Object.keys(socialLinks).length > 0 && (
              <div className="mt-3 flex flex-col items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Reach {booth.name} here
                </p>
                <SocialLinksRow links={socialLinks} />
              </div>
            )}
          </div>
        )}
      </div>
      <OrderForm
        code={code}
        boothId={booth.booth_id}
        menuItems={available}
        menuCategories={categories}
        closed={closed}
        remaining={remaining}
        left={itemsLeft}
        maxPerOrder={maxPerOrder}
        paysInPerson={paysInPerson}
      />
    </div>
  );
}
