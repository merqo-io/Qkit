import { AcceptTermsPage, safeRedirectPath } from "@merqo/ui";

import { LegalWordmark } from "../wordmark";
import { acceptLegalTerms } from "./actions";

export const revalidate = 0;

// Deliberately does NOT call any legal-gate check (requireVendor /
// requireEntitledVendor / requireCurrentLegalAcceptance) — this page is what
// that gate redirects TO, so gating it the same way is an infinite redirect
// loop. acceptLegalTerms (actions.ts) re-checks for a signed-in user on submit
// and sends a signed-out visitor to /login.
export default async function LegalAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AcceptTermsPage
      action={acceptLegalTerms}
      next={safeRedirectPath(next, "/dashboard")}
      wordmark={<LegalWordmark />}
    />
  );
}
