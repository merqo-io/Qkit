"use client";

import Link from "next/link";
import { LandingAccountNav, LandingNav, type NavUser } from "@merqo/ui";
import { Button } from "@merqo/ui/primitives";
import type { SupportMessageInput } from "@/lib/schemas";
import { submitFeedback } from "@/app/actions/feedback";
import { submitLandingSupport } from "@/app/actions/landing-support";

const SUPPORT_CATEGORY_LABELS: Record<SupportMessageInput["category"], string> =
  {
    pass: "Event pass",
    payment: "Payment",
    pro: "Plan / billing",
    other: "Something else",
  };

// 44px hit area below sm (WCAG 2.5.5); sm up keeps the 32px size="sm" look.
const TAP_CLASS = "h-11 min-w-11 sm:h-8 sm:min-w-0";
const LINK_CLASS = `rounded-lg ${TAP_CLASS}`;
const SECONDARY_LINK_CLASS = `hidden ${LINK_CLASS} sm:inline-flex`;

export function Nav({
  user,
  signOutAction,
}: {
  user: NavUser | null;
  signOutAction: () => Promise<void>;
}) {
  return (
    <LandingNav
      wordmark={
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- Link leaves the old hash in the URL bar on a fragment-only jump
        <a
          href="/#top"
          aria-label="qkit home, back to top"
          className="font-display inline-flex items-baseline gap-0.5 text-3xl font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </a>
      }
      end={
        <>
          <Button asChild variant="ghost" size="sm" className={LINK_CLASS}>
            <Link href="/faq">FAQ</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={SECONDARY_LINK_CLASS}
          >
            <Link href="/about">About</Link>
          </Button>
          {user ? (
            <LandingAccountNav
              kit="qkit"
              dashboardHref="/dashboard"
              user={user}
              signOutAction={signOutAction}
              actions={{ submitSupport: submitLandingSupport, submitFeedback }}
              supportCategories={SUPPORT_CATEGORY_LABELS}
              LinkComponent={Link}
            />
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className={`hidden ${LINK_CLASS} sm:inline-flex`}
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className={LINK_CLASS}>
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </>
      }
    />
  );
}
