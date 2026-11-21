// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppLink } from "@merqo/ui";
import { Providers } from "./providers";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} data-next-link="">
      {children}
    </a>
  ),
}));

function Probe() {
  return createElement(useAppLink() ?? "a", { href: "/dashboard" }, "Go");
}

describe("Providers", () => {
  it("hands next/link to client exports of @merqo/ui", () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute(
      "data-next-link",
    );
  });
});
