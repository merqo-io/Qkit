import Link from "next/link";
import { Bell, Check, ListChecks, QrCode, ScanLine } from "lucide-react";
import { Button } from "@merqo/ui/primitives";

import { Nav } from "@/components/landing/nav";
import { SiteFooter } from "@/components/widgets/site-footer";
import { LandingCta } from "@/components/landing/landing-cta";
import { HeroPreviewCarousel } from "@/components/landing/hero-preview-carousel";
import { BackToTop } from "@merqo/ui";
import { Ticket } from "@/components/widgets/ticket";
import { createServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

const TRUST = ["No app", "No hardware", "Open signup"];

// The charge condition must stay beside the free claim, so both are one string.
const PRICING_LINE =
  "Free during the pilot. If we start charging, you'll get at least 30 days' notice first.";

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
    body: "Orders hit your order board in real time. Move them preparing → ready → done.",
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
        "They pay in their banking app and mark the order as paid. You check that it landed and confirm it on the board.",
        "Cash or your own card terminal at the counter works too.",
      ],
      note: "qkit never holds your money. Online card payment is not available yet.",
    },
  },
  {
    q: "How much does it cost?",
    a: PRICING_LINE,
  },
  {
    q: "Can orders stop when I sell out?",
    a: "Yes. Set a stock limit per item and qkit counts it down as orders come in, then marks it sold out so customers can't order what you've run out of.",
  },
  {
    q: "Can I schedule when my booth takes orders?",
    a: "Yes. Set open/close hours and orders stop automatically outside them, no need to pause the booth by hand.",
  },
  {
    q: "Does it work for non-food booths?",
    a: "Yes. Any booth that takes orders (drinks, snacks, merch) works. Items can be priced or queue-only.",
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const primaryHref = user ? "/dashboard" : "/login?mode=signup";
  const primaryLabel = user ? "Go to dashboard" : "Get started";

  return (
    <div id="top" className="min-h-screen">
      <Nav authed={Boolean(user)} />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 lg:justify-start">
              <span className="rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Piloting
              </span>
              <span className="text-sm text-muted-foreground">
                Running with a few vendors
              </span>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <ScanLine className="size-3.5" />
              Scan · order · track
            </span>
            <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Booth ordering,
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
          What qkit does
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

      <section className="mx-auto max-w-5xl px-5 py-14 text-center">
        <p className="mx-auto max-w-xl text-base font-semibold text-foreground">
          {PRICING_LINE}
        </p>
        <div className="mt-6">
          <LandingCta
            href={primaryHref}
            event={user ? undefined : "landing_cta"}
            className="h-12 rounded-xl px-7 text-base font-semibold"
          >
            {primaryLabel}
          </LandingCta>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-5 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          For new vendors
        </p>
        <h2 className="font-display mt-2 text-3xl font-semibold">Questions</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          What most vendors ask before their first event.
        </p>
        <div className="mt-6 space-y-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Already selling? Signed-in vendors will find the full guide in the{" "}
          <Link
            href="/dashboard/help"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            user guide
          </Link>
          .
        </p>
      </section>

      <SiteFooter showSignIn />

      <BackToTop />
    </div>
  );
}
