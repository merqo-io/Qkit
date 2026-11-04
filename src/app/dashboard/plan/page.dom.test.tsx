// @vitest-environment jsdom
// Render the page with a mocked entitlement read and plan catalog.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan.fixtures";
import type { Entitlement, Tier } from "@/lib/plan";
import PlanPage from "./page";

const { requireEntitledVendor, fetchPlanCatalog } = vi.hoisted(() => ({
  requireEntitledVendor: vi.fn(),
  fetchPlanCatalog: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({ requireEntitledVendor }));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@merqo/ui")>()),
  fetchPlanCatalog,
}));

const CATALOG = {
  plans: [
    {
      slug: "starter",
      kind: "tier",
      name: "Starter",
      monthly_cents: 900,
      annual_cents: 9000,
      kits: ["qkit"],
    },
    {
      slug: "qkit",
      kind: "kit",
      name: "qkit",
      monthly_cents: 1600,
      annual_cents: 16000,
      kits: ["qkit"],
    },
  ],
  event_pass: { per_cup_cents: 15, min_cents: 1000, cap_cents: 5000, days: 3 },
};

function entitlement(tier: Tier, over: Partial<Entitlement> = {}) {
  return { entitlement: { ...ENTITLEMENTS[tier], ...over } };
}

beforeEach(() => {
  requireEntitledVendor.mockReset();
  fetchPlanCatalog.mockReset().mockResolvedValue(CATALOG);
});

describe("PlanPage", () => {
  it("fetches the catalog from the merqo base url", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    render(await PlanPage());
    expect(fetchPlanCatalog).toHaveBeenCalledWith(
      process.env.MERQO_BASE_URL ?? "https://www.merqo.io",
    );
  });

  it("renders the ladder with qkit highlighted and live prices", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    const { container } = render(await PlanPage());

    expect(screen.getByText("S$16")).toBeInTheDocument();
    expect(screen.getByText("S$9")).toBeInTheDocument();
    const highlighted = container.querySelector("li[aria-current='true']");
    expect(highlighted).toHaveTextContent("qkit");
    expect(highlighted).toHaveTextContent("Recommended");
    expect(highlighted).not.toHaveTextContent("Starter");
  });

  it("marks the vendor's current tier and keeps the Starter identity copy", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("starter"));
    const { container } = render(await PlanPage());

    const starterCard = screen
      .getByRole("heading", { name: "Starter" })
      .closest("li");
    expect(starterCard).toHaveTextContent("Your current plan");
    expect(starterCard).toHaveTextContent("testing the waters");
    expect(container.textContent?.match(/Your current plan/g)).toHaveLength(1);
  });

  it("shows the current plan and a calm line, with no prices, when the catalog is null", async () => {
    fetchPlanCatalog.mockResolvedValue(null);
    requireEntitledVendor.mockResolvedValue(entitlement("starter"));
    const { container } = render(await PlanPage());

    expect(container.textContent).toContain("You are on the Starter plan");
    expect(container.textContent).toContain("Prices are unavailable");
    expect(container.textContent).not.toMatch(/S?\$\s?\d/);
    expect(container.querySelector("li")).toBeNull();
  });

  it("points to the Merqo account for changes", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("starter"));
    const { container } = render(await PlanPage());
    expect(container.textContent).toContain("Change plan from your Merqo");
  });

  it("describes a scheduled Event Pass without a countdown", async () => {
    requireEntitledVendor.mockResolvedValue(
      entitlement("free", {
        eventPass: {
          startsAt: "2030-01-02T00:00:00Z",
          endsAt: "2030-01-03T00:00:00Z",
          running: false,
        },
      }),
    );
    const { container } = render(await PlanPage());
    expect(container.textContent).toContain("starts 2030-01-02");
  });
});
