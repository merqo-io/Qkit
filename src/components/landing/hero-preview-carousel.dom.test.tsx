// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroPreviewCarousel } from "./hero-preview-carousel";
import { LANDING_BOARDS } from "./landing-boards";

vi.mock("@/app/dashboard/order-advance-actions", () => ({
  advanceOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
  restoreAutoCompleted: vi.fn(),
}));
vi.mock("@/app/dashboard/order-payment-actions", () => ({
  confirmOrderPayment: vi.fn(),
  confirmPaymentAndStart: vi.fn(),
  declinePaymentClaim: vi.fn(),
  revertPaymentAndStart: vi.fn(),
}));
vi.mock("@/app/dashboard/order-cancel-actions", () => ({
  cancelOrder: vi.fn(),
  bumpOrder: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function mockMatchMedia(initial: boolean) {
  let reduced = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() {
      return reduced;
    },
    media: q,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    dispatchEvent: () => false,
  }));
  return (next: boolean) => {
    reduced = next;
    act(() => listeners.forEach((fn) => fn()));
  };
}

function dots() {
  return screen.getAllByRole("button", { name: /^Show sample/ });
}

function current() {
  return dots().findIndex((b) => b.getAttribute("aria-current") === "true");
}

function wait(ms: number) {
  act(() => void vi.advanceTimersByTime(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("HeroPreviewCarousel", () => {
  it("renders the board's real order cards for every sample ticket", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(screen.getAllByText("Not paid yet").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Says paid. Check the payment").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Mark Picked Up").length).toBeGreaterThan(0);
    const tickets = LANDING_BOARDS.flatMap((board) => board.orders);
    for (const order of tickets)
      expect(screen.getAllByText(order.name).length).toBeGreaterThan(0);
  });

  it("puts every ticket control inside an inert subtree, so no action can fire", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    const buttons = screen
      .getAllByRole("button", { hidden: true })
      .filter((b) => !/^Show sample/.test(b.getAttribute("aria-label") ?? ""));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons)
      expect(button.closest("[inert]")).not.toBeNull();
  });

  it("keeps tickets invisible and unaged until their board is seeded", () => {
    mockMatchMedia(false);
    const html = renderToString(<HeroPreviewCarousel />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const grids = doc.querySelectorAll("[inert]");
    expect(grids).toHaveLength(LANDING_BOARDS.length);
    for (const grid of Array.from(grids)) {
      expect(grid.classList.contains("invisible")).toBe(true);
      expect(grid.textContent).not.toMatch(/\d{5}/);
    }
  });

  it("shows tickets once seeded", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    for (const grid of Array.from(container.querySelectorAll("[inert]")))
      expect(grid.classList.contains("invisible")).toBe(false);
  });

  it("shows only active tickets and a true active count per board", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getAllByText(/^\d+ active$/)).toHaveLength(
      LANDING_BOARDS.length,
    );
  });

  it("draws the booth box plain and top-aligns every slide", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    const track = screen.getByTestId("hero-track");
    const box = track.parentElement;
    expect(box?.classList.contains("rounded-xl")).toBe(true);
    expect(box?.className).not.toMatch(/shadow-|zigzag|ticket/);
    for (const slide of Array.from(track.children)) {
      expect(slide.classList.contains("justify-start")).toBe(true);
      expect(slide.classList.contains("justify-center")).toBe(false);
    }
  });

  it("advances one board after 7 seconds", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(current()).toBe(0);
    wait(7000);
    expect(current()).toBe(1);
  });

  it("restarts the whole countdown on any interaction", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    const root = container.firstElementChild as HTMLElement;
    wait(6000);
    fireEvent.wheel(root);
    wait(6000);
    expect(current()).toBe(0);
    wait(1000);
    expect(current()).toBe(1);
    wait(5000);
    fireEvent.keyDown(root, { key: "ArrowRight" });
    wait(6999);
    expect(current()).toBe(1);
  });

  it("restarts the countdown once for a burst of wheel events", () => {
    mockMatchMedia(false);
    const { container } = render(<HeroPreviewCarousel />);
    const root = container.firstElementChild as HTMLElement;
    wait(6000);
    fireEvent.wheel(root);
    wait(100);
    fireEvent.wheel(root);
    wait(100);
    fireEvent.wheel(root);
    wait(6799);
    expect(current()).toBe(0);
    wait(1);
    expect(current()).toBe(1);
  });

  it("follows a reduced-motion change while mounted", () => {
    const setReduced = mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    setReduced(true);
    wait(30000);
    expect(current()).toBe(0);
    setReduced(false);
    wait(7000);
    expect(current()).toBe(1);
  });

  it("never moves two boards on one tick", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    wait(7001);
    expect(current()).toBe(1);
  });

  it("does not auto-advance with reduced motion", () => {
    mockMatchMedia(true);
    render(<HeroPreviewCarousel />);
    wait(30000);
    expect(current()).toBe(0);
  });

  it("jumps to a board from its dot", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    fireEvent.click(dots()[3]);
    expect(current()).toBe(3);
  });

  it("has one slide per sample board with a lead caption", () => {
    mockMatchMedia(false);
    render(<HeroPreviewCarousel />);
    expect(screen.getAllByRole("group")).toHaveLength(LANDING_BOARDS.length);
    for (const board of LANDING_BOARDS)
      expect(screen.getByText(board.lead)).toBeInTheDocument();
  });
});
