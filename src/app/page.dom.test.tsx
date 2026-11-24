// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
const { getUser, nav } = vi.hoisted(() => ({
  getUser: vi.fn(),
  nav: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser },
  }),
}));
vi.mock("@/lib/landing/showcase", () => ({
  getShowcaseVendors: async () => [],
}));
vi.mock("@/lib/landing-nav-user", () => ({
  getLandingNavUser: async (user: { id: string } | null) =>
    user ? { name: "Kopi Corner" } : null,
}));
vi.mock("@/components/landing/nav", () => ({
  Nav: (props: unknown) => {
    nav(props);
    return null;
  },
}));
vi.mock("@/components/widgets/site-footer", () => ({
  SiteFooter: () => null,
}));
vi.mock("@/components/landing/hero-preview-carousel", () => ({
  HeroPreviewCarousel: () => <div data-sample-board />,
}));
vi.mock("@/components/landing/journey/try-it", () => ({
  TryIt: () => (
    <section id="how">
      <h2>What your customer sees. What you see.</h2>
    </section>
  ),
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
});

describe("public landing page", () => {
  it("offers signup", async () => {
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Get started" }))
      expect(link).toHaveAttribute("href", "/login?mode=signup");
    expect(nav).toHaveBeenCalledWith(expect.objectContaining({ user: null }));
  });
  it("keeps vendor troubleshooting out of the public page and points to the guide", async () => {
    render(await LandingPage());
    expect(
      screen.queryByRole("heading", { name: "Troubleshooting" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/send a screenshot/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "user guide" })).toHaveAttribute(
      "href",
      "/dashboard/help",
    );
  });
  it("takes an authenticated vendor to their dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "vendor" } } });
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Go to dashboard" }))
      expect(link).toHaveAttribute("href", "/dashboard");
    expect(nav).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { name: "Kopi Corner" },
      }),
    );
  });
  it("says PayNow checkout exists and that qkit does not hold the money", async () => {
    render(await LandingPage());
    expect(
      screen.getByText(/Yes\. The customer pays in their banking app/),
    ).toHaveTextContent(
      /qkit never holds it\. Online card payment is not available\.$/,
    );
    expect(screen.queryByText(/^Not yet\./)).not.toBeInTheDocument();
  });
  it("shows the hero, the story section and the closing call with exactly three FAQ rows", async () => {
    const { container } = render(await LandingPage());
    for (const name of [
      "Take orders, not queues.",
      "What your customer sees. What you see.",
      "Put your menu on it.",
    ])
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(container.querySelector("#how")).toBeInTheDocument();
    expect(container.querySelector("#faq")).toBeInTheDocument();
    expect(container.querySelectorAll("details[data-faq-row]")).toHaveLength(3);
    expect(screen.queryByText(/Up and running in three steps/)).toBeNull();
    expect(screen.queryByText("What qkit does")).toBeNull();
  });
  it("drops the trust line and the dark pain band", async () => {
    render(await LandingPage());
    expect(screen.queryByText("No app. No hardware. Open signup.")).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "You are shouting numbers again.",
      }),
    ).toBeNull();
    expect(screen.queryByText(/Lunch rush/)).toBeNull();
  });
  it("puts the status row, then the kicker pill, ahead of the headline", async () => {
    render(await LandingPage());
    const pilot = screen.getByText(
      "Built in Singapore for event carts and stalls",
    );
    const kicker = screen.getByText(/Scan · order · track/);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(
      pilot.compareDocumentPosition(kicker) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      kicker.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it("shows the built-in-Singapore line and keeps open signup", async () => {
    render(await LandingPage());
    expect(screen.queryByText("Piloting")).toBeNull();
    expect(
      screen.getByText("Built in Singapore for event carts and stalls"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Get started" }).length,
    ).toBeGreaterThan(0);
  });
  it("shows the pilot line and both after-pilot prices", async () => {
    const { container } = render(await LandingPage());
    const text = container.textContent ?? "";
    expect(
      screen.getByText(
        "Free while we pilot. These are the prices after, with 30 days' notice.",
      ),
    ).toBeInTheDocument();
    expect(text).toContain("S$14 to S$28 per event");
    expect(text).toContain("15c a cup");
    expect(text).toContain("S$19.90/month");
    expect(text).not.toContain("Free during the pilot");
    expect(text).not.toContain("—");
  });
  it("promises a 10-minute setup and PayNow in the sub-line", async () => {
    render(await LandingPage());
    expect(
      screen.getByText(/Setup takes about 10 minutes/),
    ).toBeInTheDocument();
    expect(screen.getByText(/PayNow, straight to you/)).toBeInTheDocument();
  });
  it("makes no readiness, other-kit or company claims", async () => {
    const { container } = render(await LandingPage());
    const text = (container.textContent ?? "")
      .replace("Now picture your menu on it.", "")
      .replace("one live board", "");
    expect(text).not.toMatch(
      /\b(live|now|available today|proven|shopkit|reachkit|Pte|GST)\b/i,
    );
    expect(text).not.toContain("QKit");
    expect(text).not.toContain("Qkit");
  });
});
