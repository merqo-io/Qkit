// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const regenerate = vi.fn();
const errorToast = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => errorToast(...args),
    success: vi.fn(),
  },
}));
vi.mock("../../actions", () => ({
  regenerateShortCode: (...args: unknown[]) => regenerate(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RegenerateButton } from "./regenerate-button";

beforeEach(() => regenerate.mockReset());

describe("RegenerateButton", () => {
  it("keeps confirmation usable and explains a rejected action", async () => {
    regenerate.mockRejectedValueOnce(new Error("network disconnected"));
    render(<RegenerateButton boothId="b-1" boothName="Kopitiam Cart" />);
    await userEvent.click(
      screen.getByRole("button", { name: /regenerate qr/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /regenerate|confirm/i }),
    );
    expect(errorToast).toHaveBeenCalledWith(
      "Could not regenerate QR. Try again.",
    );
    // The dialog closes and the button leaves its pending state a tick after
    // the rejection, so wait for it instead of reading the DOM at once.
    expect(
      await screen.findByRole("button", { name: "Regenerate QR" }),
    ).toBeEnabled();
  });
  it("names the booth in the confirmation and calls the action on confirm", async () => {
    regenerate.mockResolvedValue({ success: true });
    render(<RegenerateButton boothId="b-1" boothName="Kopitiam Cart" />);

    await userEvent.click(
      screen.getByRole("button", { name: /regenerate qr/i }),
    );
    // Modal names the specific booth.
    expect(screen.getByText(/Kopitiam Cart/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /regenerate|confirm/i }),
    );
    expect(regenerate).toHaveBeenCalledWith("b-1");
  });

  it("does not call the action when cancelled", async () => {
    render(<RegenerateButton boothId="b-1" boothName="Kopitiam Cart" />);
    await userEvent.click(
      screen.getByRole("button", { name: /regenerate qr/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(regenerate).not.toHaveBeenCalled();
  });
});
