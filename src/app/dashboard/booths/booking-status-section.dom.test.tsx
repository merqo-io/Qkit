// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookingStatusSection } from "./booking-status-section";
import type { BookingStatus } from "@/lib/paykit/client";

const originalUrl = process.env.NEXT_PUBLIC_PAYKIT_URL;

afterEach(() => {
  // process.env.X = undefined stringifies to "undefined" in Node, not
  // unset — delete instead when there was nothing there to restore.
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_PAYKIT_URL;
  else process.env.NEXT_PUBLIC_PAYKIT_URL = originalUrl;
});

const STATUS: BookingStatus = {
  bookingId: "b-1",
  status: "deposit_paid",
  eventDate: "2026-09-01",
  depositAmountCents: 20000,
  balanceAmountCents: 30000,
  totalAmountCents: 50000,
  depositConfirmed: true,
  balanceConfirmed: false,
};

describe("BookingStatusSection", () => {
  it("calls onChange with the typed value", () => {
    const onChange = vi.fn();
    render(<BookingStatusSection value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Paykit booking ID"), {
      target: { value: "abc-123" },
    });
    expect(onChange).toHaveBeenCalledWith("abc-123");
  });

  it("calls onChange with null when cleared", () => {
    const onChange = vi.fn();
    render(<BookingStatusSection value="abc-123" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Paykit booking ID"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows no status block or unavailable text when no id is set", () => {
    render(<BookingStatusSection value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deposit paid/i)).not.toBeInTheDocument();
  });

  it("shows a quiet unavailable message when an id is set but status is null", () => {
    render(
      <BookingStatusSection value="abc-123" onChange={vi.fn()} status={null} />,
    );
    expect(
      screen.getByText("Booking status unavailable right now."),
    ).toBeInTheDocument();
  });

  it("renders the booking status, event date, and deposit/balance paid state", () => {
    render(
      <BookingStatusSection
        value="abc-123"
        onChange={vi.fn()}
        status={STATUS}
      />,
    );
    expect(screen.getByText("Deposit paid")).toBeInTheDocument();
    expect(screen.getByText(/Deposit S\$200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Balance S\$300\.00/)).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Not yet paid")).toBeInTheDocument();
  });

  it("links to paykit's bookings list so a vendor can find/copy a booking ID", () => {
    process.env.NEXT_PUBLIC_PAYKIT_URL = "https://paykit.test";
    render(<BookingStatusSection value={null} onChange={vi.fn()} />);
    expect(
      screen.getByRole("link", {
        name: "Find or create a booking in paykit →",
      }),
    ).toHaveAttribute("href", "https://paykit.test/dashboard/bookings");
  });

  it("hides the paykit link when its URL is unset", () => {
    delete process.env.NEXT_PUBLIC_PAYKIT_URL;
    render(<BookingStatusSection value={null} onChange={vi.fn()} />);
    expect(
      screen.queryByRole("link", { name: /find or create a booking/i }),
    ).not.toBeInTheDocument();
  });
});
