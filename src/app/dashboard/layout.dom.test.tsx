// @vitest-environment jsdom
// Render the layout to catch duplicate landmarks outside the shared nav.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan";
import DashboardLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { signOut: vi.fn() },
  })),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: vi.fn(async () => ({
    user: { id: "v1", user_metadata: {} },
    vendor: {
      name: "Kopi Corner",
      tours_seen: { orders: "2026-01-01T00:00:00Z" },
    },
    entitlement: ENTITLEMENTS.free,
  })),
}));
vi.mock("@/lib/admin/access", () => ({
  isAdmin: vi.fn(async () => false),
}));
// The legal-acceptance gate has its own suite (legal-gate.test.ts); stubbed
// here so this test stays focused on layout.tsx's header composition and
// doesn't reach for a real service-role client.
vi.mock("@/lib/legal-gate", () => ({
  requireCurrentLegalAcceptance: vi.fn(async () => {}),
}));
// The onboarding tour's own auto-run/driver.js behavior is covered by
// dashboard-tour.dom.test.tsx; stubbed here so this test stays focused on
// layout.tsx's header composition.
vi.mock("@/components/tour/dashboard-tour", () => ({
  DashboardTour: () => null,
}));

describe("DashboardLayout", () => {
  it("renders exactly one <header> landmark (@merqo/ui's DashboardNav owns it — layout.tsx must not wrap it in its own)", async () => {
    const jsx = await DashboardLayout({ children: <div>page content</div> });
    const { container } = render(jsx);

    expect(container.querySelectorAll("header")).toHaveLength(1);
  });

  // jsdom verifies the sticky header wrapper, not browser scrolling.
  it("wraps the header in a display:contents div, not a plain div, so sticky positioning has room to work", async () => {
    const jsx = await DashboardLayout({ children: <div>page content</div> });
    const { container } = render(jsx);

    const header = container.querySelector("header");
    expect(header?.parentElement).toHaveClass("contents", "print:hidden");
  });

  it("ends with the family footer, without a sign-in link, hidden when printing", async () => {
    const jsx = await DashboardLayout({ children: <div>page content</div> });
    const { container } = render(jsx);

    const footer = container.querySelector("footer");
    expect(footer?.parentElement).toHaveClass("contents", "print:hidden");
    expect(footer).toHaveTextContent("© 2026 qkit · a Merqo kit");
    expect(footer).not.toHaveTextContent("Vendor sign in");
  });
});
