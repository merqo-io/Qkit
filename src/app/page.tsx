import Link from "next/link";
import { Button } from "@merqo/ui/primitives";

import { Nav } from "@/components/landing/nav";
import { signOutToHome } from "@/app/actions/auth";
import { getLandingNavUser } from "@/lib/landing-nav-user";
import { SiteFooter } from "@/components/widgets/site-footer";
import { LandingCta } from "@/components/landing/landing-cta";
import { HeroPreviewCarousel } from "@/components/landing/hero-preview-carousel";
import { BackToTop, FaqRows, type FaqRow } from "@merqo/ui";
import { ScanLine } from "lucide-react";
import { TryIt } from "@/components/landing/journey/try-it";
import { VendorShowcase } from "@/components/landing/vendor-showcase";
import { createServerClient } from "@/lib/supabase/server";
import { CONTAINER } from "@/components/landing/rhythm";

export const revalidate = 0;

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
      <Nav user={await getLandingNavUser(user)} signOutAction={signOutToHome} />

      <main>
        <section className="pt-[clamp(40px,7vw,96px)] pb-[clamp(56px,8vw,112px)]">
          <div className={CONTAINER}>
            <div className="grid items-stretch gap-10 min-[960px]:grid-cols-[1.05fr_1fr] min-[960px]:gap-16">
              <div className="flex min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="rounded-full border-[1.5px] border-primary/40 px-3 py-[3px] text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    Piloting
                  </span>
                  <span className="text-[15px] text-muted-foreground">
                    Running with a few vendors
                  </span>
                </div>
                <span className="mt-3.5 inline-flex items-center gap-2 self-start rounded-full bg-primary/12 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  <ScanLine className="size-3.5" aria-hidden="true" />
                  Scan · order · track
                </span>
                <h1 className="font-display mt-[22px] text-balance text-[clamp(44px,6.4vw,80px)] font-semibold leading-[1.02] tracking-[-0.02em]">
                  Take orders, <br />
                  not queues.
                </h1>
                <p className="mt-6 max-w-[34em] text-[clamp(17px,1.6vw,20px)] leading-[1.55] text-muted-foreground">
                  Customers scan your QR or open your link, order and pay by
                  PayNow, straight to you. You run every order from one live
                  board, at a cart, a stall or from home.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <LandingCta
                    href={primaryHref}
                    event={user ? undefined : "landing_cta"}
                    className="h-12 rounded-lg px-[26px] text-base font-semibold"
                  >
                    {primaryLabel}
                  </LandingCta>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-lg px-[26px] text-base font-semibold"
                  >
                    <a href="#how">See how</a>
                  </Button>
                </div>
              </div>
              <div className="relative min-w-0">
                <HeroPreviewCarousel />
              </div>
            </div>
          </div>
        </section>

        <VendorShowcase />

        <TryIt />

        <section
          id="faq"
          className="scroll-mt-20 border-t border-border py-[clamp(56px,8vw,96px)]"
        >
          <div className={CONTAINER}>
            <div className="grid gap-10 min-[960px]:grid-cols-2 min-[960px]:gap-16">
              <div>
                <h2 className="font-display text-balance text-[clamp(34px,4.4vw,54px)] font-semibold leading-[1.05] tracking-[-0.015em]">
                  Put your menu on it.
                </h2>
                <p className="mt-[18px] max-w-[30em] text-lg text-muted-foreground">
                  {PRICING_LINE}
                </p>
                <div className="mt-7">
                  <LandingCta
                    href={primaryHref}
                    event={user ? undefined : "landing_cta"}
                    className="h-12 rounded-lg px-[26px] text-base font-semibold"
                  >
                    {primaryLabel}
                  </LandingCta>
                </div>
              </div>
              <div>
                <FaqRows rows={FAQ} />
                <p className="mt-[18px] text-[14.5px] text-muted-foreground">
                  Already selling? Signed-in vendors will find the full guide in
                  the{" "}
                  <Link
                    href="/dashboard/help"
                    className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4 hover:no-underline"
                  >
                    user guide
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter showSignIn />

      <BackToTop />
    </div>
  );
}
