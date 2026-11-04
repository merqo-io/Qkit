// @vitest-environment jsdom
// Render the page with a mocked entitlement read.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, within } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan.fixtures";
import type { Entitlement, Tier } from "@/lib/plan";
import PlanPage from "./page";

// The tier badge at the top of the page can share text with the grid's own
// tier column headers (most notably "Free" on the free tier), so every
// assertion below is scoped to the grid's own container.
function getGrid(container: HTMLElement) {
  const grid = container.querySelector(".overflow-hidden.rounded-2xl.border");
  if (!grid) throw new Error("comparison grid container not found");
  return within(grid as HTMLElement);
}

const { requireEntitledVendor } = vi.hoisted(() => ({
  requireEntitledVendor: vi.fn(),
}));

vi.mock("@/lib/supabase/get-entitlement", () => ({ requireEntitledVendor }));

function entitlement(tier: Tier, over: Partial<Entitlement> = {}) {
  return { entitlement: { ...ENTITLEMENTS[tier], ...over } };
}

beforeEach(() => {
  requireEntitledVendor.mockReset();
});

describe("PlanPage", () => {
  it("renders the Free/Starter/qkit header columns via PlanComparisonTable", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    const { container } = render(await PlanPage());
    const grid = getGrid(container);

    expect(grid.getByText("Feature")).toBeInTheDocument();
    expect(grid.getByText("Free")).toBeInTheDocument();
    expect(grid.getByText("Starter")).toBeInTheDocument();
    expect(grid.getByText("qkit")).toBeInTheDocument();
  });

  it("renders every FEATURES row label, in order", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    const { container } = render(await PlanPage());

    const rowDivs = Array.from(
      container.querySelectorAll(
        ".overflow-hidden.rounded-2xl.border > .border-t",
      ),
    );
    expect(rowDivs.map((el) => el.querySelector("span")?.textContent)).toEqual([
      "Live order board",
      "QR posters",
      "Unlimited items & customization",
      "Scheduled auto-close hours",
      "Sold-out stock caps",
      "Extra booths",
      "Customer queue display (TV)",
      "Order labels",
      "Order-ready push alerts",
      "Full history & trends (7/30/90d)",
    ]);
  });

  it("marks the right tiers on a row", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("free"));
    const { container } = render(await PlanPage());
    const grid = getGrid(container);

    const extraBooths = grid.getByText("Extra booths").closest("div");
    expect(extraBooths?.querySelectorAll("svg").length).toBe(1);
    const liveBoard = grid.getByText("Live order board").closest("div");
    expect(liveBoard?.querySelectorAll("svg").length).toBe(3);
  });

  it("shows no prices and points to the Merqo account for changes", async () => {
    requireEntitledVendor.mockResolvedValue(entitlement("starter"));
    const { container } = render(await PlanPage());
    expect(container.textContent).not.toMatch(/\$\s?\d/);
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
