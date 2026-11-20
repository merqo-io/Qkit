// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "./nav";

describe("Nav", () => {
  it("links to the About page", () => {
    render(<Nav user={null} signOutAction={async () => {}} />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("links to the full FAQ page", () => {
    render(<Nav user={null} signOutAction={async () => {}} />);
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute(
      "href",
      "/faq",
    );
  });

  it("keeps the FAQ link visible on phones, not hidden below sm", () => {
    render(<Nav user={null} signOutAction={async () => {}} />);
    const link = screen.getByRole("link", { name: "FAQ" });
    expect(link.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("hides Sign in below sm so the signed-out row fits at 320px", () => {
    render(<Nav user={null} signOutAction={async () => {}} />);
    const signIn = screen.getByRole("link", { name: "Sign in" }).className;
    expect(signIn).toMatch(/(^|\s)hidden(\s|$)/);
    expect(signIn).toContain("sm:inline-flex");
    for (const name of ["FAQ", "Get started"]) {
      expect(screen.getByRole("link", { name }).className).not.toMatch(
        /(^|\s)hidden(\s|$)/,
      );
    }
  });

  it("shows Sign in / Get started when signed out", () => {
    render(<Nav user={null} signOutAction={async () => {}} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/login?mode=signup",
    );
  });

  it("shows Dashboard when signed in", () => {
    render(<Nav user={{ name: "a" }} signOutAction={async () => {}} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
