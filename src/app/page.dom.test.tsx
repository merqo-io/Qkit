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
});

describe("public landing page", () => {
  it("offers signup", async () => {
    render(await LandingPage());
    for (const link of screen.getAllByRole("link", { name: "Get started" }))
      expect(link).toHaveAttribute("href", "/login?mode=signup");
    expect(nav).toHaveBeenCalledWith({ authed: false });
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
    expect(nav).toHaveBeenCalledWith({ authed: true });
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
  it("lets the visitor play one order through three chapters with exactly three FAQ rows", async () => {
    const { container } = render(await LandingPage());
    for (const name of [
      "You are shouting numbers again.",
      "Order a kopi.",
      "It is already on your board.",
      "The number calls itself.",
      "That was the whole product. Now picture your menu on it.",
    ])
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    for (const t of ["No app", "No hardware", "Open signup"])
      expect(screen.getByText(t)).toBeInTheDocument();
    expect(container.querySelector("#how")).toBeInTheDocument();
    expect(container.querySelectorAll("details[data-faq-row]")).toHaveLength(3);
    expect(
      screen.getByText("Says paid. Check the payment"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Up and running in three steps/)).toBeNull();
    expect(screen.queryByText("What qkit does")).toBeNull();
    expect(screen.queryByText(/Built in Singapore/)).toBeNull();
  });
  it("shows the pilot badge and keeps open signup", async () => {
    render(await LandingPage());
    expect(screen.getByText("Piloting")).toBeInTheDocument();
    expect(screen.getByText("Running with a few vendors")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Get started" }).length,
    ).toBeGreaterThan(0);
  });
  it("shows the free-during-pilot line with its 30-day notice condition", async () => {
    render(await LandingPage());
    const line =
      "Free during the pilot. If we start charging, you'll get at least 30 days' notice first.";
    expect(screen.getAllByText(line).length).toBeGreaterThan(0);
  });
  it("shows no prices, plan names or day-pass copy", async () => {
    const { container } = render(await LandingPage());
    const text = container.textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/\bPro\b/);
    expect(text).not.toMatch(/event pass|monthly|day pass|beta|free plan/i);
    expect(text).not.toContain("—");
  });
  it("makes no readiness, other-kit or company claims", async () => {
    const { container } = render(await LandingPage());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /\b(live|available now|available today|proven|shopkit|reachkit|Pte|GST)\b/i,
    );
    expect(text).not.toContain("QKit");
    expect(text).not.toContain("Qkit");
  });
});
