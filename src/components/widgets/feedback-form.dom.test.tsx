// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const { submit, error } = vi.hoisted(() => ({
  submit: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/app/actions/feedback", () => ({ submitFeedback: submit }));
vi.mock("sonner", () => ({ toast: { error } }));
import { FeedbackForm } from "./feedback-form";
beforeEach(() => {
  vi.clearAllMocks();
  submit.mockResolvedValue({ success: true });
});
const send = () =>
  fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

describe("feedback submission", () => {
  it.each(["stars", "nps"] as const)(
    "requires content for %s feedback",
    (metric) => {
      render(<FeedbackForm source="vendor" metric={metric} />);
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "   " },
      });
      send();
      expect(submit).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        metric === "nps"
          ? "Pick a score or leave a note"
          : "Add a rating or a message",
      );
    },
  );
  it("submits the order access token with a trimmed customer review", async () => {
    render(
      <FeedbackForm
        source="customer"
        boothId="booth"
        orderNumber="A001"
        token="opaque-token"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Good coffee  " },
    });
    send();
    await screen.findByText(/Thanks for the feedback/);
    expect(submit).toHaveBeenCalledWith({
      source: "customer",
      boothId: "booth",
      orderNumber: "A001",
      token: "opaque-token",
      rating: 4,
      nps: undefined,
      message: "Good coffee",
    });
  });
  it("accepts zero as an intentional NPS score", async () => {
    render(
      <FeedbackForm
        source="vendor"
        metric="nps"
        prompt="Would you recommend us?"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "0" }));
    send();
    await screen.findByText(/Thanks for the feedback/);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        nps: 0,
        rating: undefined,
        message: undefined,
      }),
    );
  });
  it("accepts a note without fabricating a rating", async () => {
    render(<FeedbackForm source="customer" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "More options please" },
    });
    send();
    await screen.findByText(/Thanks for the feedback/);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: undefined,
        message: "More options please",
      }),
    );
  });
  it("retains input and supports retry after a rejected submission", async () => {
    submit.mockResolvedValueOnce({ success: false, error: "Try again" });
    render(<FeedbackForm source="customer" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Please improve" },
    });
    send();
    await waitFor(() => expect(error).toHaveBeenCalledWith("Try again"));
    expect(screen.getByRole("textbox")).toHaveValue("Please improve");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send feedback" }),
      ).toBeEnabled(),
    );
    send();
    await screen.findByText(/Thanks for the feedback/);
  });
  it("disables repeat submissions while the request is pending", async () => {
    let finish!: (result: { success: boolean }) => void;
    submit.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<FeedbackForm source="customer" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Feedback" },
    });
    send();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    finish({ success: true });
    await screen.findByText(/Thanks for the feedback/);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("keeps feedback available for retry after a transport rejection", async () => {
    submit.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<FeedbackForm source="customer" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Keep this note" },
    });
    send();
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "Could not send feedback. Please try again.",
      ),
    );
    expect(screen.getByRole("textbox")).toHaveValue("Keep this note");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send feedback" }),
      ).toBeEnabled(),
    );
    send();
    await screen.findByText(/Thanks for the feedback/);
  });
});

describe("NPS score row", () => {
  it("offers all eleven scores and selects one by touch", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm source="vendor" metric="nps" />);
    expect(screen.getAllByRole("radio")).toHaveLength(11);
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("radio", { name: "7" }),
    });
    send();
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ nps: 7 })),
    );
  });
  it("wraps on narrow screens and keeps the 44px touch size", () => {
    render(<FeedbackForm source="vendor" metric="nps" />);
    const radios = screen.getAllByRole("radio");
    expect(radios[0].parentElement).toHaveClass(
      "grid-cols-6",
      "sm:grid-cols-11",
    );
    for (const r of radios) {
      expect(r).toHaveClass("pointer-coarse:h-11", "pointer-coarse:min-w-11");
      expect(r.className).not.toContain("pointer-coarse:min-w-0");
    }
  });
});
