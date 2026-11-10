// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "./loading";

describe("onboarding Loading", () => {
  it("announces a busy status with an accessible label", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading");
  });

  it("hides the decorative skeleton from assistive tech", () => {
    const { container } = render(<Loading />);
    const decorative = container.querySelector('[aria-hidden="true"]');
    expect(decorative).not.toBeNull();
    expect(screen.getByRole("status")).toContainElement(
      decorative as HTMLElement,
    );
  });
});
