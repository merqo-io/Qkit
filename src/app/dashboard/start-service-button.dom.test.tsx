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

import { TooltipProvider } from "@/components/ui/tooltip";
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
      screen.getByText(/The item count for Kopi Cart goes back to 0/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Start new service" }),
    );
    expect(startNewService).toHaveBeenCalledWith("b-1");
    expect(successToast).toHaveBeenCalledWith(
      "New service started. Kopi Cart is back to 0 items.",
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

  it("shows the action's error and does not refresh", async () => {
    startNewService.mockResolvedValue({
      success: false,
      error: "Booth not found",
    });
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });
    await openAndConfirm();
    expect(errorToast).toHaveBeenCalledWith("Booth not found");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains a rejected action", async () => {
    startNewService.mockRejectedValueOnce(new Error("network down"));
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" compact />, {
      wrapper: TooltipProvider,
    });
    await openAndConfirm();
    expect(errorToast).toHaveBeenCalledWith(
      "Could not start a new service. Try again.",
    );
  });

  it("shows a labelled button outside the board", () => {
    render(<StartServiceButton boothId="b-1" boothName="Kopi Cart" />);
    expect(
      screen.getByRole("button", { name: "Start new service" }),
    ).toBeInTheDocument();
  });
});
