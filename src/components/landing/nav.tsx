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

const LINK_CLASS = "rounded-lg";
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
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden rounded-lg sm:inline-flex"
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </>
      }
    />
  );
}
