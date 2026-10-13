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

// tesseract.js is a heavy WASM library, loaded via a dynamic import inside the
// component (never at module scope) — mocked entirely so this test never
// actually loads WASM, matching this codebase's next/dynamic-for-heavy-deps
// pattern (see PayPanel/react-qr-code).
const { createWorkerMock, recognizeMock, terminateMock } = vi.hoisted(() => ({
  createWorkerMock: vi.fn(),
  recognizeMock: vi.fn(),
  terminateMock: vi.fn(),
}));

vi.mock("tesseract.js", () => ({
  createWorker: createWorkerMock,
}));

const PHOTO = "https://signed.example/proof.png";

function proof(over: Record<string, unknown> = {}) {
  return {
    url: PHOTO,
    duplicateOrderNumber: null,
    duplicateElsewhere: false,
    amountMatch: null,
    ...over,
  };
}

beforeEach(() => {
  getOrderPaymentProofMock.mockReset().mockResolvedValue(proof());
  createWorkerMock.mockReset();
  recognizeMock.mockReset();
  terminateMock.mockReset();
  terminateMock.mockResolvedValue(undefined);
  createWorkerMock.mockResolvedValue({
    recognize: recognizeMock,
    terminate: terminateMock,
  });
  recognizeMock.mockResolvedValue({ data: { text: "" } });
});

describe("PaymentProofViewer", () => {
  it("reads the order's proof through the one server action", async () => {
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(await screen.findByRole("img")).toHaveAttribute("src", PHOTO);
    expect(getOrderPaymentProofMock).toHaveBeenCalledTimes(1);
    expect(getOrderPaymentProofMock).toHaveBeenCalledWith("order-1");
  });

  it("does not match an expected amount inside a larger amount", async () => {
    recognizeMock.mockResolvedValueOnce({ data: { text: "PAID $15.50" } });
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    expect(
      await screen.findByText(/couldn't confirm the amount/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/amount matches/i)).not.toBeInTheDocument();
  });

  it.each(["5.50", "PAID $5.50 to stall", "Ref 12.00\n5.50"])(
    "matches the expected amount as a whole number in %j",
    async (text) => {
      recognizeMock.mockResolvedValueOnce({ data: { text } });
      render(
        <PaymentProofViewer orderId="order-1" expectedAmountCents={550} />,
      );
      expect(await screen.findByText(/amount matches/i)).toBeInTheDocument();
    },
  );

  it("reads the photo paykit linked to", async () => {
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    await waitFor(() => expect(recognizeMock).toHaveBeenCalledWith(PHOTO));
  });

  it.each([
    [true, /amount matches \$5\.50/i],
    [false, /couldn't confirm the amount/i],
  ])(
    "shows paykit's own amount reading (%j) without reading the photo again",
    async (amountMatch, text) => {
      getOrderPaymentProofMock.mockResolvedValue(proof({ amountMatch }));
      render(
        <PaymentProofViewer orderId="order-1" expectedAmountCents={550} />,
      );
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(createWorkerMock).not.toHaveBeenCalled();
    },
  );

  it("terminates the OCR worker when recognition fails", async () => {
    recognizeMock.mockRejectedValueOnce(new Error("Unreadable image"));
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);
    await waitFor(() => expect(terminateMock).toHaveBeenCalledOnce());
  });

  it("terminates pending OCR when the viewer is closed", async () => {
    recognizeMock.mockImplementationOnce(() => new Promise(() => {}));
    const { unmount } = render(
      <PaymentProofViewer orderId="order-1" expectedAmountCents={550} />,
    );
    await waitFor(() => expect(recognizeMock).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(terminateMock).toHaveBeenCalledOnce());
  });

  it("shows the photo, then the amount hint, and no duplicate warning", async () => {
    recognizeMock.mockResolvedValueOnce({ data: { text: "PAID $5.50" } });

    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(
      await screen.findByText(/amount matches \$5\.50/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already used/i)).not.toBeInTheDocument();
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
      expect(createWorkerMock).not.toHaveBeenCalled();
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

  it("spawns the tesseract worker with workerBlobURL disabled (blob: workers are refused under this app's CSP, which has no worker-src/child-src)", async () => {
    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    await waitFor(() => expect(createWorkerMock).toHaveBeenCalled());
    expect(createWorkerMock).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({ workerBlobURL: false }),
    );
  });

  it("shows a couldn't-confirm hint when the OCR text doesn't contain the amount", async () => {
    recognizeMock.mockResolvedValueOnce({ data: { text: "no numbers here" } });

    render(<PaymentProofViewer orderId="order-1" expectedAmountCents={550} />);

    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(
      await screen.findByText(/couldn't confirm the amount/i),
    ).toBeInTheDocument();
  });
});
