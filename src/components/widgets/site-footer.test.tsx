// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("renders the wordmark, tagline, copyright line, and sign-in link", () => {
    render(<SiteFooter showSignIn />);

    expect(
      screen.getByRole("link", { name: "qkit home, back to top" }),
    ).toHaveAttribute("href", "/#top");
    expect(
      screen.getByText("Built for booths. Made in Singapore."),
    ).toBeInTheDocument();
    expect(screen.getByText("© 2026 qkit · a Merqo kit")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vendor sign in →" }),
    ).toHaveAttribute("href", "/login");
  });

  it("leaves the sign-in link off by default, for the signed-in dashboard", () => {
    render(<SiteFooter />);
    expect(
      screen.queryByRole("link", { name: "Vendor sign in →" }),
    ).not.toBeInTheDocument();
  });

  it("links to the About page", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("links to the Terms and Privacy pages", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
  });
});
