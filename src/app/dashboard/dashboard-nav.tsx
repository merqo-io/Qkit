"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";
import {
  DashboardNav as SharedDashboardNav,
  getSwitchKits,
  TierChip,
} from "@merqo/ui";
import type { Tier } from "@/lib/plan";
import type { SupportMessageInput } from "@/lib/schemas";
import { submitFeedback } from "@/app/actions/feedback";
import { submitSupportMessage } from "@/app/actions/support";

const LINKS = [
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/completed", label: "Completed" },
  { href: "/dashboard/booths", label: "Booths" },
  { href: "/dashboard/stats", label: "Stats" },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

/** Stable anchor id for the onboarding tour, e.g. "/dashboard/booths" → "nav-booths". */
function tourAnchor(href: string): string {
  return `nav-${href === "/dashboard" ? "orders" : href.split("/").pop()}`;
}

// Category list/labels for the nav's Get-help sheet.
const HELP_CATEGORIES: {
  value: SupportMessageInput["category"];
  label: string;
}[] = [
  { value: "pass", label: "Event pass" },
  { value: "payment", label: "Payment" },
  { value: "pro", label: "Plan / billing" },
  { value: "other", label: "Something else" },
];

// @merqo/ui's getHelp.onSubmit types `category` as a bare `string | undefined`
// (it has no knowledge of qkit's own category literals), so narrow it back
// to SupportMessageInput["category"] by checking membership in the values
// qkit itself offered via HELP_CATEGORIES, instead of asserting the type.
const HELP_CATEGORY_VALUES: readonly string[] = HELP_CATEGORIES.map(
  (c) => c.value,
);
function isHelpCategory(
  value: string | undefined,
): value is SupportMessageInput["category"] {
  return value !== undefined && HELP_CATEGORY_VALUES.includes(value);
}

/**
 * Dashboard nav — composes `@merqo/ui`'s `DashboardNav`/`AccountMenu` for the
 * sticky header row (burger + inline links + account dropdown) instead of
 * hand-rolling it. This file now owns only qkit-specific bits: the wordmark,
 * the link list, active-route/tour-anchor logic, the tier badge, and thin
 * throw-adapting wrappers around `submitFeedback`/`submitSupportMessage` (both
 * return a `{success, error}` result rather than throwing, but the shared
 * component's `onSubmit` contract requires a promise that rejects on
 * failure so its own inline error UI can surface it).
 */
export function DashboardNav({
  signOut,
  vendorName = "",
  avatarUrl = null,
  tier = "free",
}: {
  signOut: () => Promise<void>;
  vendorName?: string;
  avatarUrl?: string | null;
  tier?: Tier;
}) {
  const path = usePathname();

  return (
    <SharedDashboardNav
      LinkComponent={Link}
      wordmark={
        <Link
          href="/dashboard"
          aria-label="qkit dashboard home"
          className="font-display shrink-0 text-3xl font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-primary">Q</span>Kit
        </Link>
      }
      navLinks={LINKS}
      isActiveHref={(href) => isActive(path, href)}
      tourAnchor={tourAnchor}
      vendor={{
        name: vendorName || "Account",
        avatarUrl: avatarUrl ?? undefined,
        tier,
        // `subtitle` is the only line @merqo/ui's AccountMenu renders next
        // to the trigger and in the dropdown header, so it can't carry both
        // a generic descriptor and the vendor's real name — the actual
        // stall name is far more useful here than a static "Vendor
        // account" label.
        subtitle: vendorName || "Your stall",
      }}
      signOutAction={signOut}
      kitLocalSettingsHref="/dashboard/settings"
      switchKits={getSwitchKits("qkit")}
      tierBadge={<TierChip tier={tier} />}
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
        const res = await submitFeedback({ source: "vendor", nps, message });
        if (!res.success) throw new Error(res.error);
      }}
      extraLink={{
        href: "/dashboard/help",
        label: "User guide",
        icon: BookOpen,
      }}
      feedbackSource="vendor"
      feedbackMetric="nps"
      showNps
    />
  );
}
