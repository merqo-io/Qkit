// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BoothList } from "./booth-list";
const errorToast = vi.fn();
const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

beforeEach(() => errorToast.mockClear());

afterEach(() => {
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => errorToast(...args),
    success: vi.fn(),
  },
}));

const BOOTH = {
  id: "b1",
  name: "Kopi Cart",
  is_active: true,
  image_url: null,
  itemCount: 3,
  paused: false,
  shortCode: "abc123",
};

describe("BoothList", () => {
  it.each([
    ["Open", { is_active: true, paused: false }],
    ["Paused", { is_active: false, paused: false }],
    ["Over plan limit", { is_active: true, paused: true }],
  ])("labels a booth %s", (label, state) => {
    render(<BoothList booths={[{ ...BOOTH, ...state }]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("explains clipboard failure without an unhandled rejection", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<BoothList booths={[BOOTH]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy order link" }));
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        "Could not copy the link. Open the booth QR to share it.",
      ),
    );
  });
  it("opens the same Customer screen dialog as the board, for this booth", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <BoothList booths={[BOOTH, { ...BOOTH, id: "b2", name: "Tea Cart" }]} />,
    );

    const [first] = screen.getAllByRole("button", { name: "Customer screen" });
    fireEvent.click(first!);
    expect(
      await screen.findByRole("dialog", { name: "Customer screen" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open the screen/i }));
    expect(open).toHaveBeenCalledWith(
      `${window.location.origin}/order/b1/display`,
      "qkit-screen-b1",
      expect.any(String),
    );
    open.mockRestore();
  });

  it("no longer links straight to the display page", () => {
    render(<BoothList booths={[BOOTH]} />);
    expect(
      screen.queryByRole("link", { name: /customer queue display/i }),
    ).not.toBeInTheDocument();
  });
});
