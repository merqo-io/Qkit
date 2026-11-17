// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "./nav";

describe("Nav", () => {
  it("links to the About page", () => {
    render(<Nav authed={false} />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });

  it("links to the full FAQ page", () => {
    render(<Nav authed={false} />);
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute(
      "href",
      "/faq",
    );
  });

  it("shows Sign in / Get started when signed out", () => {
    render(<Nav authed={false} />);
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
    render(<Nav authed={true} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
