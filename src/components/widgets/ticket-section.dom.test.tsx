// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Section } from "./ticket-section";

describe("Section", () => {
  it("renders inside a Ticket shell (scalloped-card visual class present)", () => {
    const { container } = render(
      <Section icon={<span />} title="Stall name" description="desc">
        <p>content</p>
      </Section>,
    );
    expect(container.querySelector(".ticket")).toBeInTheDocument();
  });

  it("renders the icon, title, and description via the shared Section header", () => {
    render(
      <Section
        icon={<span data-testid="my-icon" />}
        title="Stall name"
        description="desc"
      >
        <p>content</p>
      </Section>,
    );
    expect(screen.getByTestId("my-icon")).toBeInTheDocument();
    expect(screen.getByText("Stall name")).toBeInTheDocument();
    expect(screen.getByText("desc")).toBeInTheDocument();
  });

  it("renders a tooltip via the shared Section header when tooltip is set", async () => {
    const user = userEvent.setup();
    render(
      <Section
        icon={<span />}
        title="Stall name"
        description="desc"
        tooltip="extra detail"
      >
        <p>content</p>
      </Section>,
    );
    await user.hover(
      screen.getByRole("button", { name: /more about stall name/i }),
    );
    // Radix renders the visible bubble plus a visually hidden role=tooltip
    // copy for assistive tech; require the visible one.
    const matches = await screen.findAllByText("extra detail");
    expect(
      matches.some((el) => el.getAttribute("data-state") === "delayed-open"),
    ).toBe(true);
    expect(matches.some((el) => el.getAttribute("role") === "tooltip")).toBe(
      true,
    );
  });
});
