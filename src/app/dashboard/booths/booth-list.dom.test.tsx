// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BoothList } from "./booth-list";

// The app mounts one TooltipProvider at the root; the card's icon buttons
// need it.
const render = (ui: ReactElement) =>
  rtlRender(ui, { wrapper: TooltipProvider });
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
    // Same height as the card's other small buttons.
    expect(first).toHaveAttribute("data-size", "sm");
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

  it("shows the Customer screen button as an icon, named on hover", async () => {
    const user = userEvent.setup();
    render(<BoothList booths={[BOOTH]} />);
    const button = screen.getByRole("button", { name: "Customer screen" });
    expect(button).not.toHaveTextContent("Customer screen");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Customer screen",
    );
  });

  it.each(["Booth QR code", "Copy order link"])(
    "names the %s icon on hover",
    async (label) => {
      const user = userEvent.setup();
      render(<BoothList booths={[BOOTH]} />);
      await user.hover(
        screen.getByRole(/QR/.test(label) ? "link" : "button", { name: label }),
      );
      expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
    },
  );

  it("no longer links straight to the display page", () => {
    render(<BoothList booths={[BOOTH]} />);
    expect(
      screen.queryByRole("link", { name: /customer queue display/i }),
    ).not.toBeInTheDocument();
  });
});
