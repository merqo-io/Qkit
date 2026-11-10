// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const startNewService = vi.fn();
const errorToast = vi.fn();
const successToast = vi.fn();
const refresh = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => errorToast(...args),
    success: (...args: unknown[]) => successToast(...args),
  },
}));
vi.mock("./booths/actions", () => ({
  startNewService: (...args: unknown[]) => startNewService(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { TooltipProvider } from "@merqo/ui/primitives";

import { StartServiceButton } from "./start-service-button";

beforeEach(() => {
  startNewService.mockReset();
  errorToast.mockReset();
  successToast.mockReset();
  refresh.mockReset();
});

async function openAndConfirm() {
  await userEvent.click(
    screen.getByRole("button", { name: /start a new service for/i }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start new service" }),
  );
}

describe("StartServiceButton", () => {
  it("names the booth in the confirmation and resets on confirm", async () => {
    startNewService.mockResolvedValue({ success: true });
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Start a new service for Kopi Cart" }),
    );
    expect(
      screen.getByText(
        /daily item count goes back to 0 and any per-item Sold-out limits start again/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Start new service" }),
    );
    expect(startNewService).toHaveBeenCalledWith("b-1");
    expect(successToast).toHaveBeenCalledWith(
      "New service started. Kopi Cart count and Sold-out limits start again.",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("does not reset when cancelled", async () => {
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });
    await userEvent.click(
      screen.getByRole("button", { name: /start a new service for/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(startNewService).not.toHaveBeenCalled();
  });

  it("hands the stamped time to onStarted before refreshing", async () => {
    const onStarted = vi.fn();
    startNewService.mockResolvedValue({
      success: true,
      startedAt: "2026-10-11T04:00:00.000Z",
    });
    render(
      <StartServiceButton
        boothId="b-1"
        boothName="Kopi Cart"
        compact
        onStarted={onStarted}
      />,
      { wrapper: TooltipProvider },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start a new service for Kopi Cart" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start new service" }),
    );
    expect(onStarted).toHaveBeenCalledWith("b-1", "2026-10-11T04:00:00.000Z");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the action's error and does not refresh", async () => {
    startNewService.mockResolvedValue({
      success: false,
      error: "Booth not found",
    });
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });
    await openAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Booth not found",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains a rejected action", async () => {
    startNewService.mockRejectedValueOnce(new Error("network down"));
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });
    await openAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not start a new service. Try again.",
    );
  });

  it("shows the count and the label together in the board pill", () => {
    render(
      <StartServiceButton
        boothId="b-1"
        boothName="Kopi Cart"
        compact
        countLabel="12/200 items"
      />,
      { wrapper: TooltipProvider },
    );
    const pill = screen.getByRole("button", {
      name: "Start a new service for Kopi Cart",
    });
    expect(pill).toHaveTextContent("12/200 items");
    expect(pill).toHaveTextContent("New service");
    expect(pill).not.toHaveClass("text-status-aging");
  });

  it("turns the pill amber when the count is low", () => {
    render(
      <StartServiceButton
        boothId="b-1"
        boothName="Kopi Cart"
        compact
        countLabel="195/200 items"
        low
      />,
      { wrapper: TooltipProvider },
    );
    expect(
      screen.getByRole("button", { name: "Start a new service for Kopi Cart" }),
    ).toHaveClass("text-status-aging");
  });

  it("shows only the label when there is no count", () => {
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });
    const pill = screen.getByRole("button", {
      name: "Start a new service for Kopi Cart",
    });
    expect(pill).toHaveTextContent(/^New service$/);
  });

  it("shows a labelled button outside the board", () => {
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" />);
    expect(
      screen.getByRole("button", { name: "Start new service" }),
    ).toBeInTheDocument();
  });
});
