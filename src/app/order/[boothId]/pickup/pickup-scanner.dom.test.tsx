// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PickupScanner } from "./pickup-scanner";

const { confirmCollectionMock } = vi.hoisted(() => ({
  confirmCollectionMock: vi.fn(),
}));
vi.mock("../[orderNumber]/collect-actions", () => ({
  confirmCollection: confirmCollectionMock,
}));

beforeEach(() => {
  confirmCollectionMock.mockReset();
});

describe("PickupScanner", () => {
  it("recovers focus and accepts a retry when the collection request rejects", async () => {
    confirmCollectionMock.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    const scan =
      "https://qkit.example/order/b1/0007?t=11111111-1111-1111-8111-111111111111";
    fireEvent.change(input, { target: { value: scan } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText(/could not complete order.*scan again/i);
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
    confirmCollectionMock.mockResolvedValueOnce({
      success: true,
      status: "completed",
    });
    fireEvent.change(input, { target: { value: scan } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText(/order #0007 collected/i),
    ).toBeInTheDocument();
  });
  it("auto-focuses its input on mount", () => {
    render(<PickupScanner boothId="b1" />);
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("parses a scanned URL for this booth, calls confirmCollection, and flashes success", async () => {
    confirmCollectionMock.mockResolvedValueOnce({
      success: true,
      status: "completed",
    });
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b1/0007?t=11111111-1111-1111-8111-111111111111{Enter}",
    );
    expect(confirmCollectionMock).toHaveBeenCalledWith(
      "b1",
      "0007",
      "11111111-1111-1111-8111-111111111111",
    );
    expect(
      await screen.findByText(/order #0007 collected/i),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("rejects a scan for a different booth without calling confirmCollection", async () => {
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b2/0007?t=11111111-1111-1111-8111-111111111111{Enter}",
    );
    expect(confirmCollectionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/wrong stall/i)).toBeInTheDocument();
  });

  it("disables the input while a scan is being processed, re-enabling after", async () => {
    let resolveCall: (v: unknown) => void = () => {};
    confirmCollectionMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveCall = r;
      }),
    );
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b1/0007?t=11111111-1111-1111-8111-111111111111{Enter}",
    );
    expect(input).toBeDisabled();
    resolveCall({ success: true, status: "completed" });
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it("ignores a second Enter fired mid-flight, calling confirmCollection only once", async () => {
    let resolveCall: (v: unknown) => void = () => {};
    confirmCollectionMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveCall = r;
      }),
    );
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(
      input,
      "https://qkit.example/order/b1/0007?t=11111111-1111-1111-8111-111111111111{Enter}",
    );
    expect(input).toBeDisabled();
    expect(confirmCollectionMock).toHaveBeenCalledTimes(1);

    // Simulate a second scan's full keystrokes landing while the first is
    // still in flight. fireEvent bypasses user-event's own refusal to type
    // into a disabled input, so this only passes if handleKeyDown's own
    // `busy` guard -- not just the DOM disabled attribute -- is what stops
    // a second confirmCollection call from firing.
    fireEvent.change(input, {
      target: {
        value:
          "https://qkit.example/order/b1/0008?t=22222222-2222-2222-8222-222222222222",
      },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    await Promise.resolve();
    expect(confirmCollectionMock).toHaveBeenCalledTimes(1);

    resolveCall({ success: true, status: "completed" });
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(confirmCollectionMock).toHaveBeenCalledTimes(1);
  });

  it("ignores an unparseable scan", async () => {
    render(<PickupScanner boothId="b1" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "garbage-not-a-url{Enter}");
    expect(confirmCollectionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/couldn't read that/i)).toBeInTheDocument();
  });
});
