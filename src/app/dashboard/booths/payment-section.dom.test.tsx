// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentSection } from "./payment-section";
import type { PaymentSetup } from "@/lib/paykit/payment-setup";

const SWITCH = "Take payment for orders at this booth";
const originalUrl = process.env.NEXT_PUBLIC_PAYKIT_URL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_PAYKIT_URL;
  else process.env.NEXT_PUBLIC_PAYKIT_URL = originalUrl;
  window.history.replaceState(null, "", "/");
});

function renderSection(setup: PaymentSetup, value = false, onChange = vi.fn()) {
  render(<PaymentSection setup={setup} value={value} onChange={onChange} />);
  return onChange;
}

describe("PaymentSection", () => {
  it.each([
    [
      "PayNow",
      { state: "paynow", name: "Kopitiam Cart" },
      "On file in paykit: PayNow QR, paid to Kopitiam Cart",
    ],
    [
      "a payment link",
      { state: "link", name: "Pay with PayLah" },
      "On file in paykit: payment link, “Pay with PayLah”",
    ],
    [
      "a QR image",
      { state: "image", name: "GrabPay" },
      "On file in paykit: your own QR image, “GrabPay”",
    ],
    [
      "PayNow with no payee name",
      { state: "paynow", name: "" },
      "On file in paykit: PayNow QR",
    ],
  ] as const)(
    "summarises %s and lets the booth be switched",
    (_, setup, summary) => {
      const onChange = renderSection(setup);

      expect(screen.getByText(summary)).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: "Change payment details in paykit →",
        }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
      expect(onChange).toHaveBeenCalledWith(true);
    },
  );

  it("shows the switch on for a booth that takes payment, and turns it off", () => {
    const onChange = renderSection({ state: "paynow", name: "Cart" }, true);

    const toggle = screen.getByRole("switch", { name: SWITCH });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("with nothing on file, keeps the switch off and points to paykit to set up", () => {
    const onChange = renderSection({ state: "none" }, true);

    const toggle = screen.getByRole("switch", { name: SWITCH });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText("No payment details on file yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up payments in paykit →" }),
    ).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "when paykit cannot be reached, shows the stored setting (%s) and locks it",
    (stored) => {
      const onChange = renderSection({ state: "unreachable" }, stored);

      const toggle = screen.getByRole("switch", { name: SWITCH });
      expect(toggle).toBeDisabled();
      expect(toggle.getAttribute("aria-checked")).toBe(String(stored));
      expect(
        screen.getByText(
          "Can't reach paykit right now. This booth keeps its current payment setting.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Open payment setup in paykit →" }),
      ).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("opens paykit's setup page in a new tab, carrying this page as the way back", () => {
    process.env.NEXT_PUBLIC_PAYKIT_URL = "https://paykit.test";
    window.history.replaceState(null, "", "/dashboard/booths/new?mode=event");
    renderSection({ state: "none" });

    const link = screen.getByRole("link", {
      name: "Set up payments in paykit →",
    });
    const href = new URL(link.getAttribute("href") ?? "");
    expect(href.origin + href.pathname).toBe(
      "https://paykit.test/dashboard/config",
    );
    expect(href.searchParams.get("return_to")).toBe(
      `${window.location.origin}/dashboard/booths/new?mode=event`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    { state: "none" },
    { state: "paynow", name: "Cart" },
    { state: "link", name: "Pay" },
    { state: "image", name: "Pay" },
    { state: "unreachable" },
  ] as const)("has no field for a payment detail (%j)", (setup) => {
    const { container } = render(
      <PaymentSection setup={setup} value={true} onChange={vi.fn()} />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
