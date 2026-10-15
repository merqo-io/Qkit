// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PaymentProofViewer } from "./payment-proof-viewer";

// getOrderPaymentProof is a server action (payment-evidence-actions.ts,
// covered by its own tests) — mocked here so this component's tests only
// assert on rendering, not on where the screenshot comes from.
const { getOrderPaymentProofMock } = vi.hoisted(() => ({
  getOrderPaymentProofMock: vi.fn(),
}));

vi.mock("@/app/dashboard/payment-evidence-actions", () => ({
  getOrderPaymentProof: getOrderPaymentProofMock,
}));

const PHOTO = "https://signed.example/proof.png";

function proof(over: Record<string, unknown> = {}) {
  return {
    url: PHOTO,
    duplicateOrderNumber: null,
    duplicateOrderDay: null,
    duplicateElsewhere: false,
    amountMatch: null,
    ...over,
  };
}

beforeEach(() => {
  getOrderPaymentProofMock.mockReset().mockResolvedValue(proof());
});

describe("PaymentProofViewer", () => {
  it("reads the order's proof through the one server action and shows the photo", async () => {
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(await screen.findByRole("img")).toHaveAttribute("src", PHOTO);
    expect(getOrderPaymentProofMock).toHaveBeenCalledTimes(1);
    expect(getOrderPaymentProofMock).toHaveBeenCalledWith("order-1");
  });

  it("shows no amount hint and no warning when paykit reports neither", async () => {
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    await screen.findByRole("img");
    expect(screen.queryByText(/amount/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/already used/i)).not.toBeInTheDocument();
  });

  it("says the amount matches, with the order's amount, when paykit read it in the photo", async () => {
    getOrderPaymentProofMock.mockResolvedValue(proof({ amountMatch: true }));
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(
      await screen.findByText(
        "Amount matches $5.50. Verify payment in your payment app.",
      ),
    ).toBeInTheDocument();
  });

  it("says it could not confirm the amount when paykit did not find it", async () => {
    getOrderPaymentProofMock.mockResolvedValue(proof({ amountMatch: false }));
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(
      await screen.findByText(/couldn't confirm the amount/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/amount matches/i)).not.toBeInTheDocument();
  });

  it("names the other order when the same photo was used for it", async () => {
    getOrderPaymentProofMock.mockResolvedValue(
      proof({ duplicateOrderNumber: "0031" }),
    );
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(
      await screen.findByText(/already used for order #0031/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/another payment/i)).not.toBeInTheDocument();
  });

  it("names an earlier day's order with its day, so it is not read as today's", async () => {
    getOrderPaymentProofMock.mockResolvedValue(
      proof({ duplicateOrderNumber: "0024", duplicateOrderDay: "1 Oct" }),
    );
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(
      await screen.findByText(
        "This photo was already used for order #0024 on 1 Oct",
      ),
    ).toBeInTheDocument();
  });

  it("warns without a number when the same photo was used for a payment it cannot name", async () => {
    getOrderPaymentProofMock.mockResolvedValue(
      proof({ duplicateElsewhere: true }),
    );
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(
      await screen.findByText(/already used for another payment/i),
    ).toBeInTheDocument();
  });

  it.each([
    ["there is no screenshot", proof({ url: null })],
    ["the proof may not be read", null],
  ])(
    "renders nothing while loading, then says so when %s",
    async (_name, answer) => {
      getOrderPaymentProofMock.mockResolvedValue(answer);

      const { container } = render(
        <PaymentProofViewer orderId="order-2" expectedAmountCents={550} />,
      );

      expect(container).toBeEmptyDOMElement();
      expect(
        await screen.findByText(/no payment screenshot on file/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    },
  );

  it("renders nothing, and does not throw, when the action itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getOrderPaymentProofMock.mockRejectedValue(new Error("network"));
    const { container } = render(
      <PaymentProofViewer orderId="order-1" expectedAmountCents={550} />,
    );
    await waitFor(() => expect(getOrderPaymentProofMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("does not show one order's photo under another order", async () => {
    const { rerender } = render(
      <PaymentProofViewer orderId="order-1" expectedAmountCents={550} />,
    );
    await screen.findByRole("img");
    getOrderPaymentProofMock.mockImplementation(() => new Promise(() => {}));
    rerender(
      <PaymentProofViewer orderId="order-2" expectedAmountCents={550} />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(getOrderPaymentProofMock).toHaveBeenLastCalledWith("order-2");
  });
});
