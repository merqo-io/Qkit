// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const startNewService = vi.fn();
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./booths/actions", () => ({
  startNewService: (...args: unknown[]) => startNewService(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TooltipProvider } from "@merqo/ui/primitives";

import { BoothRow, BoothToggle, type BoothView } from "./board-booths";

const base: BoothView = {
  id: "b-1",
  name: "Kopi Cart",
  is_active: true,
  open: true,
};

function renderRow(b: BoothView, onServiceStarted = vi.fn()) {
  render(
    <BoothRow
      b={b}
      showDot={false}
      active
      onToggle={vi.fn()}
      onServiceStarted={onServiceStarted}
    />,
    { wrapper: TooltipProvider },
  );
  return onServiceStarted;
}

const pillName = "Start a new service for Kopi Cart";

describe("BoothRow start-service pill", () => {
  it("combines the count and the label for a booth with a daily limit", () => {
    renderRow({ ...base, daily_cup_cap: 200, cups_today: 12 });
    const pill = screen.getByRole("button", { name: pillName });
    expect(pill).toHaveTextContent("12/200 items");
    expect(pill).toHaveTextContent("New service");
    expect(pill).not.toHaveClass("text-status-aging");
  });

  it("goes amber in the last tenth of the limit", () => {
    renderRow({ ...base, daily_cup_cap: 200, cups_today: 185 });
    expect(screen.getByRole("button", { name: pillName })).toHaveClass(
      "text-status-aging",
    );
  });

  it("shows a label-only pill for a booth with just item limits", () => {
    renderRow({ ...base, has_item_limits: true });
    const pill = screen.getByRole("button", { name: pillName });
    expect(pill).toHaveTextContent(/^New service$/);
  });

  it("shows nothing for a booth with no limits", () => {
    renderRow(base);
    expect(screen.queryByRole("button", { name: pillName })).toBeNull();
  });

  it("starts a new service and reports the stamped time", async () => {
    startNewService.mockResolvedValue({
      success: true,
      startedAt: "2026-10-11T04:00:00.000Z",
    });
    const onServiceStarted = renderRow({ ...base, has_item_limits: true });
    await userEvent.click(screen.getByRole("button", { name: pillName }));
    await userEvent.click(
      screen.getByRole("button", { name: "Start new service" }),
    );
    expect(startNewService).toHaveBeenCalledWith("b-1");
    expect(onServiceStarted).toHaveBeenCalledWith(
      "b-1",
      "2026-10-11T04:00:00.000Z",
    );
  });
});

describe("BoothToggle over plan limit", () => {
  const toggle = (overLimit: boolean, active = true) =>
    render(
      <BoothToggle
        active={active}
        onChange={vi.fn()}
        boothName="Kopi Cart"
        overLimit={overLimit}
      />,
      { wrapper: TooltipProvider },
    );

  it("does not read as open and links to the booths page", () => {
    toggle(true);
    expect(
      screen.getByRole("link", { name: "Over plan limit" }),
    ).toHaveAttribute("href", "/dashboard/booths");
    expect(
      screen.getByRole("button", { name: /over your plan's limit/ }),
    ).toHaveTextContent("Not serving");
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("reads as open when within the limit", () => {
    toggle(false);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("reads as paused, not over the limit, once the vendor pauses it", () => {
    toggle(true, false);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
