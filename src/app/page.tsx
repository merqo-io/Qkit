import { Bell, Check, ListChecks, QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { LandingCta } from "@/components/landing/landing-cta";
import { HeroPreviewCarousel } from "@/components/landing/hero-preview-carousel";
import { BackToTop } from "@merqo/ui";
import { Ticket } from "@/components/widgets/ticket";
import { createServerClient } from "@/lib/supabase/server";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

export const revalidate = 0;

const TRUST = ["No app", "No hardware", "Free to start"];

const STEPS = [
  {
    icon: ListChecks,
    title: "Build your booth",
    body: "Add menu items, photos, prices, and per-item options like size or spice, in minutes.",
  },
  {
    icon: QrCode,
    title: "Print the QR",
    body: "Each booth gets a printable QR poster. Stick it on the stall; customers scan to order.",
  },
  {
    icon: Bell,
    title: "Watch orders land",
    body: "Orders hit your live board in real time. Move them preparing → ready → done.",
  },
];

const MOAT = [
  {
    title: "Real-time, no app",
    body: "Customers order from the browser; you see it instantly. Nothing to install on either side.",
  },
  {
    title: "Runs the stall, not just the orders",
    body: "Queue-only or priced, one booth or many, drinks or food. Schedule open/close and cap stock so orders stop the moment you sell out, no babysitting the board.",
  },
  {
    title: "Know your numbers",
    body: "Revenue trends, your busiest day × hour, top sellers, and true profit margin per item, so you stock and staff the next event right.",
  },
];

// An answer is either a plain sentence or a scannable block: a short lead, a
// spaced bullet list, and an optional closing note. Wordy answers use the block
// form so a vendor can find the fact fast instead of parsing a paragraph.
type FaqAnswer = string | { lead?: string; bullets?: string[]; note?: string };

type FaqEntry = { q: string; a: FaqAnswer };

// Sentinels for the two answers that depend on whether prices are set in
// /admin. Home swaps them for the entry that matches, so the FAQ cannot say
// "free" beside a pricing section that shows a price.
const FAQ_COST: FaqEntry = { q: "How much does it cost?", a: "" };
const FAQ_PLANS: FaqEntry = {
  q: "Event pass or monthly: what's the difference?",
  a: "",
};

const PLAN_DIFFERENCES = [
  "Event pass: unlocks the full kit for a single event, great for the occasional market.",
  "Monthly: keeps it on plus full sales history and trends across events, better if you trade most weeks.",
];

/** The pricing answers, worded for the prices the pricing section shows. */
function pricingAnswers(
  passPrice: string | null,
  monthlyPrice: string | null,
): Map<FaqEntry, FaqAnswer> {
  const paid = passPrice !== null || monthlyPrice !== null;
  const prices = [
    passPrice && `Event pass: ${passPrice} a day.`,
    monthlyPrice && `Monthly: ${monthlyPrice} a month.`,
  ].filter((line): line is string => Boolean(line));
  return new Map<FaqEntry, FaqAnswer>([
    [
      FAQ_COST,
      {
        lead: "Start free with one booth (up to 6 items) and today's stats.",
        bullets: [
          "The full kit adds extra booths, customization, auto-close hours, and sold-out caps.",
          ...(paid
            ? prices
            : [
                "It's free while we're in beta: just ask and we'll unlock it for your next event.",
              ]),
        ],
        note: paid
          ? "Pay by PayNow or cash. Card payment is not available yet."
          : "Per-event and monthly prices come later.",
      },
    ],
    [
      FAQ_PLANS,
      {
        lead: "Same full features either way.",
        bullets: PLAN_DIFFERENCES,
        note: paid
          ? "See the pricing section above for today's prices."
          : "Both are free during beta.",
      },
    ],
  ]);
}

const FAQ: FaqEntry[] = [
  {
    q: "Do customers need to download anything?",
    a: "No. They scan the QR and order in their phone browser, then track status on the same page. Nothing to install.",
  },
  {
    q: "How long does it take to set up?",
    a: "Minutes. Add your items, print the QR poster, stick it on the stall, and you're taking orders.",
  },
  {
    q: "What do I need to run it?",
    a: "Any phone, tablet, or laptop with a browser. No app, no special hardware, no POS terminal.",
  },
  {
    q: "Can I take payment through qkit?",
    a: {
      lead: "Yes, by PayNow. The money goes straight to your own account:",
      bullets: [
        "Add your PayNow details to a booth and customers get your QR at checkout.",
        "They pay in their banking app and send a screenshot. You confirm it on the board.",
        "Cash or your own card terminal at the counter works too.",
      ],
      note: "qkit never holds your money. Online card payment is not available yet.",
    },
  },
  FAQ_COST,
  FAQ_PLANS,
  {
    q: "Can orders stop when I sell out?",
    a: "Yes. Set a stock limit per item and qkit counts it down as orders come in, then marks it sold out so customers can't order what you've run out of. Included with the event pass and monthly.",
  },
  {
    q: "Can I schedule when my booth takes orders?",
    a: "Yes. Set open/close hours and orders stop automatically outside them, no need to pause the booth by hand. Included with the event pass and monthly.",
  },
  {
    q: "Does it work for non-food booths?",
    a: "Yes. Any booth that takes orders (drinks, snacks, merch) works. Items can be priced or queue-only.",
  },
];

// Vendor-facing troubleshooting, grounded in the actual app behaviour so a
// stall can self-serve common "why isn't this working" moments without support.
const VENDOR_FAQ: FaqEntry[] = [
  {
    q: "I signed up but never reached a dashboard.",
    a: {
      lead: "Email sign-up needs confirmation first.",
      bullets: [
        "After Create account you'll see a Check your email screen. No session starts until you click the link (check spam).",
        "If it doesn't arrive, try Create account again with the same email to resend it.",
        "Signing in with Google skips this step.",
      ],
    },
  },
  {
    q: "New orders stopped appearing on my board.",
    a: {
      lead: "The board updates live and reconnects on its own.",
      bullets: [
        "If the connection drops (tab asleep, patchy wifi) you'll see a Reconnecting notice, then it re-syncs any missed orders once it's back.",
        "If it still looks stuck, reload the page.",
        "Keeping the tab in the foreground helps.",
      ],
    },
  },
  {
    q: "A customer tapped 'I've paid' but it still shows unpaid.",
    a: {
      lead: "That button only flags the order as Says paid, a self-reported claim. It never auto-confirms.",
      bullets: [
        "Once you've seen the PayNow or transfer land, tap Confirm payment received on the order card yourself.",
        "That's the only thing that flips an order to Paid.",
      ],
    },
  },
  {
    q: "My booth is Open but customers see 'not taking orders'.",
    a: {
      lead: "A booth serves only when all three are true: it's Open (not paused), within its set hours, and within your plan's serve limit.",
      bullets: [
        "The free plan serves one live booth at a time.",
        "If you have more (say, after an event pass ended), only your oldest open booth serves and the rest show as Over plan limit.",
        "Renew a pass or go Pro to serve them all, or pause the extras.",
      ],
    },
  },
  {
    q: "My booth is Open but shows closed during the hours I set.",
    a: {
      lead: "Two things to check.",
      bullets: [
        "Scheduled hours are always read in Singapore time (SGT), so check them against SGT.",
        "Hours are a pass or Pro feature. On the free plan any saved hours are cleared, and a free booth takes orders whenever it is Open and stops when you pause it.",
      ],
    },
  },
  {
    q: "A customer says their order didn't go through.",
    a: {
      lead: "Usual causes:",
      bullets: [
        "The QR or short code was regenerated, so they need to rescan.",
        "The booth stopped serving (paused, over the plan limit, or outside SGT hours).",
        "An item sold out or went unavailable mid-order.",
        "A line exceeded 20 of one item.",
        "More than 8 orders came from the same network within a minute (clears after 60s).",
      ],
      note: "Ask them to rescan and retry. Orders are atomic with an idempotency key, so a failed or retried attempt never double-charges or duplicates.",
    },
  },
  {
    q: "I regenerated my QR and old printed codes stopped working.",
    a: {
      lead: "Regenerating a booth's QR is instant and permanent.",
      bullets: [
        "Every previously printed or saved link breaks immediately with This code expired. There's no grace period.",
        "Only regenerate if a code leaked or is being abused, and reprint the new QR right away.",
      ],
    },
  },
  {
    q: "My banner or menu photo won't upload.",
    a: {
      lead: "Check the file, then the save step.",
      bullets: [
        "Use a JPEG, PNG, or WebP (not SVG or HEIC). Large phone photos are fine; the app resizes and re-encodes them in your browser before upload.",
        "A generic Upload failed is usually a flaky connection, so wait and retry.",
        "The image only sticks once you Save the booth or item. The preview swaps instantly, but nothing is stored until you save.",
      ],
    },
  },
  {
    q: "My stats only show the last 24 hours.",
    a: {
      lead: "The 7-, 30-, and 90-day trend ranges are Pro-only.",
      bullets: [
        "An event pass unlocks the operational features (extra booths, unlimited items, stock caps, auto-close hours), but its stats still show the 24-hour view.",
        "Go monthly Pro for longitudinal trends across events.",
      ],
    },
  },
];

function FaqAnswerBody({ a }: { a: FaqAnswer }) {
  if (typeof a === "string") {
    return (
      <p className="text-[0.95rem] leading-relaxed text-foreground/80">{a}</p>
    );
  }
  return (
    <div className="space-y-3">
      {a.lead ? (
        <p className="text-[0.95rem] leading-relaxed text-foreground/80">
          {a.lead}
        </p>
      ) : null}
      {a.bullets ? (
        <ul className="space-y-2.5">
          {a.bullets.map((b) => (
            <li
              key={b}
              className="flex gap-2.5 text-[0.95rem] leading-relaxed text-foreground/80"
            >
              <span
                aria-hidden
                className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-primary/60"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {a.note ? (
        <p className="text-[0.85rem] leading-relaxed text-muted-foreground">
          {a.note}
        </p>
      ) : null}
    </div>
  );
}

function FaqItem({ q, a }: FaqEntry) {
  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 open:border-primary/50 open:bg-primary/[0.03]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-xl px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset">
        <span className="font-display text-base font-semibold leading-snug text-foreground sm:text-[1.0625rem]">
          {q}
        </span>
        <span
          aria-hidden
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border text-lg leading-none text-muted-foreground transition-[transform,color,border-color] duration-200 group-open:rotate-45 group-open:border-primary/60 group-open:text-primary"
        >
          +
        </span>
      </summary>
      <div className="px-5 pb-5">
        <hr className="perforation mb-4" />
        <FaqAnswerBody a={a} />
      </div>
    </details>
  );
}

export default async function LandingPage() {
  const supabase = await createServerClient();
  const [
    {
      data: { user },
    },
    { data: pricingRow },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("pricing")
      .select("event_pass_cents, monthly_cents, currency")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const pricing = pricingRow ?? DEFAULT_PRICING;
  // Prices unset (= pre-Stripe beta) → the pass is a free trial granted on
  // request. Set prices in /admin to flip the page to paid/PayNow framing.
  const passPrice =
    pricing.event_pass_cents > 0 ? formatPrice(pricing.event_pass_cents) : null;
  const monthlyPrice =
    pricing.monthly_cents > 0 ? formatPrice(pricing.monthly_cents) : null;
  const paidMode = passPrice !== null || monthlyPrice !== null;
  const pricingAnswer = pricingAnswers(passPrice, monthlyPrice);
  const faq = FAQ.map((entry) => ({
    q: entry.q,
    a: pricingAnswer.get(entry) ?? entry.a,
  }));

  const primaryHref = user ? "/dashboard" : "/login?mode=signup";
  const primaryLabel = user ? "Go to dashboard" : "Get started";

  return (
    <div id="top" className="min-h-screen">
      <Nav authed={Boolean(user)} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ScanLine className="size-3.5" />
              Scan · order · track
            </span>
            <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Live booth ordering,
              <br />
              minus the queue.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              qkit turns any booth into a QR-ordering stall. Customers scan and
              order from their phone; you watch every order land in real time.
            </p>
            <div className="mt-8 flex justify-center gap-3 lg:justify-start">
              <LandingCta
                href={primaryHref}
                event={user ? undefined : "landing_cta"}
                className="h-12 rounded-xl px-7 text-base font-semibold"
              >
                {primaryLabel}
              </LandingCta>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-xl px-7 text-base font-semibold"
              >
                <a href="#how">See how</a>
              </Button>
            </div>
          </div>
          <HeroPreviewCarousel />
        </div>
      </section>

      {/* Trust strip: centered below the hero, above the three steps. Extends
          the Ticket/perforation motif here too, as a single scalloped stub
          strip instead of three generic pill badges, so the hero's left
          (copy) column picks up a bit of the same distinctive treatment its
          right (carousel) column already has. Emphasized in the ember so
          the three reasons to try it stand out. */}
      <section className="mx-auto max-w-5xl px-5 pb-12 text-center">
        <Ticket
          shadow="none"
          className="mx-auto inline-flex max-w-full flex-wrap items-stretch divide-x divide-dashed divide-primary/30 bg-primary/[0.06]"
        >
          {TRUST.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary sm:px-6 sm:text-base"
            >
              <Check
                className="size-4 sm:size-[1.05rem]"
                strokeWidth={2.75}
                aria-hidden
              />
              {t}
            </span>
          ))}
        </Ticket>
        <p className="mt-5 text-sm text-muted-foreground">
          Built in Singapore for hawker stalls, night-market &amp; event booths.
        </p>
      </section>

      {/* How it works. scroll-mt-20 clears the sticky nav (about 69px) so
          "See how" does not land the heading under it. */}
      <section id="how" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-14">
        <h2 className="font-display mb-10 text-center text-3xl font-semibold">
          Up and running in three steps
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <Ticket
              key={step.title}
              shadow="none"
              className="bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_oklch(0.4_0.06_45/0.5)]"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="size-5" />
              </div>
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                Step {i + 1}
              </p>
              <h3 className="font-display mt-1 text-xl font-semibold">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </Ticket>
          ))}
        </div>
      </section>

      {/* Why / moat */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="font-display mb-10 text-center text-3xl font-semibold">
          Why vendors pick qkit
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {MOAT.map((m) => (
            <Ticket
              key={m.title}
              shadow="none"
              className="p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_oklch(0.4_0.06_45/0.5)]"
            >
              <h3 className="font-display text-xl font-semibold">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {m.body}
              </p>
            </Ticket>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="font-display mb-3 text-center text-3xl font-semibold">
          Pricing that fits how you trade
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm text-muted-foreground">
          Run free, pay per day for the events you need the full kit, or go
          monthly if you trade most weeks.
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          {/* Free */}
          <Ticket
            shadow="none"
            className="p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_oklch(0.4_0.06_45/0.5)]"
          >
            <p className="font-display text-2xl font-semibold">Free</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try it with one booth.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>1 booth · up to 6 items</li>
              <li>Live order board</li>
              <li>QR poster + customization</li>
              <li>Today&apos;s stats</li>
              <li>Unlimited orders</li>
            </ul>
          </Ticket>

          {/* Event pass */}
          <Ticket
            shadow="none"
            className="p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_oklch(0.4_0.06_45/0.5)]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-semibold">Event pass</p>
              <span
                className={
                  passPrice
                    ? "font-mono text-sm font-bold"
                    : "text-xs font-semibold text-primary"
                }
              >
                {passPrice ? (
                  <>
                    {passPrice}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      /day
                    </span>
                  </>
                ) : (
                  "Free in beta"
                )}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Full kit, priced per day.
            </p>
            {passPrice && (
              <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Founding price
              </span>
            )}
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Extra booths</li>
              <li>Unlimited items &amp; customization</li>
              <li>Scheduled auto-close hours</li>
              <li>Sold-out stock caps</li>
              <li>That event&apos;s stats</li>
            </ul>
          </Ticket>

          {/* Monthly Pro */}
          <Ticket
            shadow="none"
            className="border-primary/40 bg-primary/[0.04] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_18px_44px_-24px_oklch(0.4_0.09_45/0.55)]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-semibold text-primary">
                Monthly Pro
              </p>
              <span
                className={
                  monthlyPrice
                    ? "font-mono text-sm font-bold text-primary"
                    : "text-xs font-semibold text-muted-foreground"
                }
              >
                {monthlyPrice ?? "Coming soon"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              For trading most weeks.
            </p>
            {monthlyPrice && (
              <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Founding price
              </span>
            )}
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Everything in the pass</li>
              <li>Full history: 7 / 30 / 90-day</li>
              <li>Busy-times heatmap &amp; trends</li>
              <li>Profit margin per item + CSV</li>
            </ul>
          </Ticket>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {paidMode
            ? "Founding price for early vendors, locks in while we're in beta. Pay by PayNow or cash; card payments coming soon."
            : "Free while we're in beta. Ask for a pass to unlock the full kit for your next event."}
        </p>
        <div className="mt-6 text-center">
          <LandingCta
            href={primaryHref}
            event={user ? undefined : "landing_cta"}
            className="h-12 rounded-xl px-7 text-base font-semibold"
          >
            {primaryLabel}
          </LandingCta>
        </div>
      </section>

      {/* FAQ: two groups side by side on wide screens. The marketing questions
          and the vendor troubleshooting each read as their own receipt column,
          with a perforation tear line between every question and its answer. */}
      <section id="faq" className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-x-10 gap-y-14 lg:grid-cols-2">
          {/* Marketing questions */}
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              For new vendors
            </p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              Questions
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              What most vendors ask before their first event.
            </p>
            <div className="mt-6 space-y-3">
              {faq.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>

          {/* Vendor troubleshooting, for signed-up stalls hitting a snag. Kept
              on the home page so a vendor can find a fix fast. */}
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Already selling?
            </p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              Troubleshooting
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Quick fixes for the most common stall-side snags.
            </p>
            <div className="mt-6 space-y-3">
              {VENDOR_FAQ.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <BackToTop />
    </div>
  );
}
