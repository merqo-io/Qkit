// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
const { getUser, pricing, nav } = vi.hoisted(() => ({
  getUser: vi.fn(),
  pricing: vi.fn(),
  nav: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: pricing }) }) }),
  }),
}));
vi.mock("@/components/landing/nav", () => ({
  Nav: (props: unknown) => {
    nav(props);
    return null;
  },
}));
vi.mock("@/components/landing/footer", () => ({ Footer: () => null }));
vi.mock("@/components/landing/hero-preview-carousel", () => ({
  HeroPreviewCarousel: () => null,
}));
vi.mock("@/components/landing/landing-cta", () => ({
  LandingCta: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@merqo/ui", async (original) => ({
  ...(await original<typeof import("@merqo/ui")>()),
  BackToTop: () => null,
}));
import LandingPage from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
  pricing.mockResolvedValue({ data: null });
});

describe("public landing page", () => {
  it("offers signup with fallback pricing when no pricing row exists", async () => {
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Get started" }))
      expect(link).toHaveAttribute("href", "/login?mode=signup");
    expect(nav).toHaveBeenCalledWith({ authed: false });
    expect(
      screen.getByRole("heading", { name: "Troubleshooting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/That button only flags the order as Says paid/),
    ).toBeInTheDocument();
  });
  it("takes an authenticated vendor to their dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "vendor" } } });
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Go to dashboard" }))
      expect(link).toHaveAttribute("href", "/dashboard");
    expect(nav).toHaveBeenCalledWith({ authed: true });
  });
  it("shows explicit beta availability when both paid prices are unset", async () => {
    pricing.mockResolvedValue({
      data: { event_pass_cents: 0, monthly_cents: 0, currency: "SGD" },
    });
    render(await LandingPage());
    expect(screen.getByText("Free in beta")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Free while we're in beta. Ask for a pass to unlock the full kit for your next event.",
      ),
    ).toBeInTheDocument();
  });
  it("says PayNow checkout exists and that qkit does not hold the money", async () => {
    render(await LandingPage());
    expect(
      screen.getByText(/Yes, by PayNow\. The money goes straight to your own/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Not yet\./)).not.toBeInTheDocument();
  });
  it("keeps the beta wording out of the FAQ once a price is set", async () => {
    pricing.mockResolvedValue({
      data: { event_pass_cents: 1200, monthly_cents: 2500, currency: "SGD" },
    });
    render(await LandingPage());
    expect(screen.getByText("Event pass: $12.00 a day.")).toBeInTheDocument();
    expect(screen.getByText("Monthly: $25.00 a month.")).toBeInTheDocument();
    expect(screen.queryByText(/free while we're in beta/i)).toBeNull();
    expect(screen.queryByText(/free during beta/i)).toBeNull();
  });
  it("says the full kit is free in the FAQ while no price is set", async () => {
    pricing.mockResolvedValue({
      data: { event_pass_cents: 0, monthly_cents: 0, currency: "SGD" },
    });
    render(await LandingPage());
    expect(
      screen.getByText(/It's free while we're in beta: just ask/),
    ).toBeInTheDocument();
    expect(screen.getByText("Both are free during beta.")).toBeInTheDocument();
  });
  it.each([
    [1200, 2500],
    [0, 2500],
    [1200, 0],
  ])(
    "renders independently configured pass/month prices %s/%s",
    async (event_pass_cents, monthly_cents) => {
      pricing.mockResolvedValue({
        data: { event_pass_cents, monthly_cents, currency: "SGD" },
      });
      render(await LandingPage());
      if (event_pass_cents)
        expect(screen.getByText("$12.00")).toBeInTheDocument();
      if (monthly_cents) expect(screen.getByText("$25.00")).toBeInTheDocument();
      expect(
        screen.getByText(/Founding price for early vendors/),
      ).toBeInTheDocument();
    },
  );
});
