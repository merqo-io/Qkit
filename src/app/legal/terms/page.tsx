import { legalPageMetadata } from "@merqo/ui";

import { LegalPageClient } from "../legal-page-client";

export const metadata = legalPageMetadata("terms");

export default function TermsPage() {
  return <LegalPageClient doc="terms" kit="qkit" />;
}
