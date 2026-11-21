"use client";

import Link from "next/link";
import { LegalPage } from "@merqo/ui";

import { LegalWordmark } from "./wordmark";

// @merqo/ui 0.57 builds LegalPage so its client-only LegalDocument (a button
// with an onClick) is inlined without a "use client" boundary, so rendering
// LegalPage from a Server Component 500s. Running it from a client module
// keeps the handler legal; drop this wrapper once the package keeps the
// boundary.
export function LegalPageClient({
  doc,
  kit,
}: {
  doc: "terms" | "privacy";
  kit?: string;
}) {
  return (
    <LegalPage
      doc={doc}
      kit={kit}
      wordmark={<LegalWordmark />}
      LinkComponent={Link}
    />
  );
}
