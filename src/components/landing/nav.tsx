"use client";

import Link from "next/link";
import { AccountMenu, LandingNav } from "@merqo/ui";
import { Button } from "@merqo/ui/primitives";
import type { LandingAccount } from "@/lib/landing-account";
import type { SupportMessageInput } from "@/lib/schemas";
import { submitFeedback } from "@/app/actions/feedback";
import { submitSupportMessage } from "@/app/actions/support";

const HELP_CATEGORIES: {
  value: SupportMessageInput["category"];
  label: string;
}[] = [
  { value: "pass", label: "Event pass" },
  { value: "payment", label: "Payment" },
  { value: "pro", label: "Plan / billing" },
  { value: "other", label: "Something else" },
];

// @merqo/ui types the sheet's category as a bare string, so narrow it back by
// membership in the values this nav offered instead of asserting the type.
function isHelpCategory(
  value: string | undefined,
): value is SupportMessageInput["category"] {
  return HELP_CATEGORIES.some((c) => c.value === value);
}

// 44px hit area below sm (WCAG 2.5.5); sm up keeps the 32px size="sm" look.
const TAP_CLASS = "h-11 min-w-11 sm:h-8 sm:min-w-0";
const LINK_CLASS = `rounded-lg ${TAP_CLASS}`;
// The trigger lives inside @merqo/ui, so its hit area is grown from outside.
const AVATAR_WRAPPER_CLASS =
  "inline-flex [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:items-center [&_button]:justify-center sm:[&_button]:min-h-0 sm:[&_button]:min-w-0";
const SECONDARY_LINK_CLASS = `hidden ${LINK_CLASS} sm:inline-flex`;

export function Nav({
  account,
  signOutAction,
}: {
  account: LandingAccount | null;
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
          {account ? (
            <>
              <Button asChild variant="ghost" size="sm" className={LINK_CLASS}>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <span className={AVATAR_WRAPPER_CLASS}>
                <AccountMenu
                  LinkComponent={Link}
                  vendor={{
                    name: account.name,
                    avatarUrl: account.avatarUrl ?? undefined,
                  }}
                  signOutAction={signOutAction}
                  getHelp={{
                    type: "form",
                    onSubmit: async ({ message, category }) => {
                      const res = await submitSupportMessage({
                        category: isHelpCategory(category) ? category : "other",
                        body: message,
                      });
                      if (!res.success) throw new Error(res.error);
                    },
                    categories: HELP_CATEGORIES,
                  }}
                  onFeedbackSubmit={async ({ message, nps }) => {
                    const res = await submitFeedback({
                      source: "vendor",
                      nps,
                      message,
                    });
                    if (!res.success) throw new Error(res.error);
                  }}
                />
              </span>
            </>
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
