// @vitest-environment jsdom
//
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PayPage from "./page";

const {
  notFoundMock,
  redirectMock,
  loadPreClaimContextMock,
  requestOriginMock,
} = vi.hoisted(() => ({
  requestOriginMock: vi.fn(),
  // Real notFound() throws to abort rendering — mirror that so a test
  // hitting the notFound branch doesn't fall through into the rest of the
  // function body, same as it never would in production.
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  loadPreClaimContextMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));
vi.mock("../[orderNumber]/payment-actions", () => ({
  loadPreClaimContext: loadPreClaimContextMock,
}));
vi.mock("@/lib/request-origin", () => ({
  requestOrigin: requestOriginMock,
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  notFoundMock.mockReset().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  loadPreClaimContextMock.mockReset();
  requestOriginMock.mockReset().mockResolvedValue("https://qkit.merqo.io");
  redirectMock.mockClear();
});

describe("PayPage", () => {
  it("redirects an already paid order back to its numbered status page", async () => {
    loadPreClaimContextMock.mockResolvedValue({
      state: "placed",
      orderNumber: "0007",
    });
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(
      `/order/${BOOTH_ID}/0007?t=${TOKEN}`,
    );
  });

  it("shows a cancelled state instead of a payment form", async () => {
    loadPreClaimContextMock.mockResolvedValue({ state: "cancelled" });
    render(
      await PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    );
    expect(screen.getByText(/this order was cancelled/i)).toBeInTheDocument();
  });
  it("shows an expired state, with no payment form, for an order unpaid too long", async () => {
    loadPreClaimContextMock.mockResolvedValue({ state: "expired" });
    render(
      await PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    );
    expect(screen.getByText("This order has expired")).toBeInTheDocument();
    expect(screen.getByText(/do not pay for it/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Order again from this stall" }),
    ).toHaveAttribute("href", `/order/${BOOTH_ID}`);
  });

  it("calls notFound for an invalid booth id", async () => {
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: "not-a-uuid" }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(loadPreClaimContextMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the token is missing", async () => {
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(loadPreClaimContextMock).not.toHaveBeenCalled();
  });

  it("calls notFound when loadPreClaimContext returns null (bad token / already claimed / wrong status)", async () => {
    loadPreClaimContextMock.mockResolvedValue(null);
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("sends a pending order to paykit's pay page", async () => {
    loadPreClaimContextMock.mockResolvedValue({
      state: "pay",
      payUrl: "https://paykit.example/pay/tx-1?k=abc",
    });
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith(
      "https://paykit.example/pay/tx-1?k=abc",
    );
    expect(loadPreClaimContextMock).toHaveBeenCalledWith(
      BOOTH_ID,
      TOKEN,
      "https://qkit.merqo.io",
    );
  });

  it("offers a retry, and says nothing was charged, when paykit is unavailable", async () => {
    loadPreClaimContextMock.mockResolvedValue({ state: "unavailable" });
    render(
      await PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    );
    expect(
      screen.getByText("Could not open the payment page"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      `/order/${BOOTH_ID}/pay?t=${TOKEN}`,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the request names no host of ours", async () => {
    requestOriginMock.mockResolvedValue(null);
    await expect(
      PayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
        searchParams: Promise.resolve({ t: TOKEN }),
      }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(loadPreClaimContextMock).not.toHaveBeenCalled();
  });
});
