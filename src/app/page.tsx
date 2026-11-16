import Link from "next/link";
import { Check, ScanLine } from "lucide-react";
import { Button } from "@merqo/ui/primitives";

import { Nav } from "@/components/landing/nav";
import { SiteFooter } from "@/components/widgets/site-footer";
import { LandingCta } from "@/components/landing/landing-cta";
import { HeroPreviewCarousel } from "@/components/landing/hero-preview-carousel";
import { BackToTop, ClosingCall, FaqRows, type FaqRow } from "@merqo/ui";
import { TryIt } from "@/components/landing/journey/try-it";
import { Ticket } from "@/components/widgets/ticket";
import { createServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

const TRUST = ["No app", "No hardware", "Open signup"] as const;

const PAIN = [
  "A queue that hides your stall.",
  "Paper slips that go missing.",
  "“Forty-two! FORTY-TWO!”",
] as const;

// The charge condition must stay beside the free claim, so both are one string.
const PRICING_LINE =
  "Free during the pilot. If we start charging, you'll get at least 30 days' notice first.";

// Payment answer rests on the code: the customer marks an order as paid on
// the pay page, the ticket then reads "Says paid. Check the payment", and
// only the vendor's confirmation settles it (src/lib/ticket.ts,
// src/app/api/paykit/payment-status/route.ts, src/app/order/[boothId]/pay).
const FAQ: FaqRow[] = [
  {
    q: "Do my customers need an app?",
    a: "No. They scan the QR and order in their phone browser, then track the order on the same page.",
  },
  {
    q: "What do I need at the stall?",
    a: "A phone, tablet or laptop with a browser for the board, and your printed QR poster. No special hardware.",
  },
  {
    q: "Can I take PayNow?",
    a: "Yes. The customer pays in their banking app and marks the order as paid. The ticket then says to check the payment, and it only counts as paid once you confirm it. The money goes to your own account and qkit never holds it. Online card payment is not available.",
  },
];

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

      <section className="mx-auto max-w-6xl px-5 pb-2">
        <Ticket
          shadow="none"
          className="mx-auto flex max-w-full flex-wrap items-stretch divide-x divide-dashed divide-primary/30 bg-primary/[0.06] sm:inline-flex sm:w-auto"
        >
          {TRUST.map((t) => (
            <span
              key={t}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary sm:px-6 sm:text-base"
            >
              <Check
                className="size-4 shrink-0 sm:size-[1.05rem]"
                strokeWidth={2.75}
                aria-hidden
              />
              {t}
            </span>
          ))}
        </Ticket>
      </section>

      <section
        id="how"
        className="mt-10 scroll-mt-20 bg-foreground py-16 text-background sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-5">
          <p className="font-mono text-xs uppercase tracking-[0.12em] opacity-70">
            12:40 PM · Lunch rush
          </p>
          <h2 className="font-display mt-4 max-w-[20ch] text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl">
            You are shouting numbers again.
          </h2>
          <ul className="mt-8 max-w-xl text-lg font-medium leading-snug">
            {PAIN.map((line, i) => (
              <li
                key={line}
                className={`border-t border-background/30 py-3.5 ${
                  i === PAIN.length - 1 ? "border-b" : ""
                }`}
              >
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-7 max-w-xl text-base opacity-80">
            Here is the same order with qkit. Do it yourself, it takes three
            taps.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-10">
        <h2 className="sr-only">Play one order from start to finish</h2>
        <TryIt />
      </section>

      <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-16">
        <ClosingCall
          heading="That was the whole product. Now picture your menu on it."
          line={PRICING_LINE}
          action={
            <LandingCta
              href={primaryHref}
              event={user ? undefined : "landing_cta"}
              className="h-12 rounded-lg px-7 text-base font-semibold"
            >
              {primaryLabel}
            </LandingCta>
          }
          aside={
            <>
              <FaqRows rows={FAQ} />
              <p className="mt-5 text-sm text-muted-foreground">
                Already selling? Signed-in vendors will find the full guide in
                the{" "}
                <Link
                  href="/dashboard/help"
                  className="font-semibold text-foreground underline underline-offset-4 hover:no-underline"
                >
                  user guide
                </Link>
                .
              </p>
            </>
          }
        />
      </section>

      <SiteFooter showSignIn />

      <BackToTop />
    </div>
  );
}
