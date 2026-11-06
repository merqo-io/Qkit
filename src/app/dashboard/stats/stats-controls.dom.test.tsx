// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatsControls } from "./stats-controls";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("StatsControls accessibility", () => {
  it("exposes the selected range and the booth filter name", () => {
    render(
      <StatsControls
        range="7d"
        booth="all"
        allowedRanges={["24h", "7d"]}
        booths={[
          { id: "a", name: "Tea" },
          { id: "b", name: "Coffee" },
        ]}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "7 days", checked: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "24h", checked: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by booth" }),
    ).toBeInTheDocument();
  });
});

describe("StatsControls locked ranges", () => {
  it("renders ranges outside the plan as upgrade links, not options", () => {
    render(
      <StatsControls
        range="24h"
        booth="all"
        allowedRanges={["24h", "7d"]}
        booths={[]}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    for (const name of ["30 days", "90 days"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", "/dashboard/plan");
      expect(link).toHaveAttribute(
        "title",
        "Longer ranges are not on your plan",
      );
    }
  });
});
