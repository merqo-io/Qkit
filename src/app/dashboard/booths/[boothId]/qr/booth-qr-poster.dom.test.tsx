// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../../actions", () => ({ regenerateShortCode: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BoothQrPoster } from "./booth-qr-poster";

const props = {
  boothId: "b-1",
  name: "Kopi Cart",
  isActive: true,
  overLimit: false,
  code: "abc123",
};

describe("BoothQrPoster", () => {
  it("warns on screen only that an active over-limit booth cannot take orders", () => {
    render(<BoothQrPoster {...props} overLimit />);
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent(/over your plan's limit/);
    expect(warning).toHaveClass("print:hidden");
  });

  it("shows no warning for a booth that serves", () => {
    render(<BoothQrPoster {...props} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/paused/)).toBeNull();
  });

  it("keeps the paused warning for a booth the vendor paused", () => {
    render(<BoothQrPoster {...props} isActive={false} />);
    expect(screen.getByText(/This booth is paused/)).toBeInTheDocument();
  });
});
