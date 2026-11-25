// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLinksSection } from "./social-links-section";

describe("SocialLinksSection", () => {
  it("stays off (null) by default and shows no fields", () => {
    render(
      <SocialLinksSection
        value={null}
        onChange={() => {}}
        vendorDefaults={{ website: "https://vendor.example" }}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: /use custom links/i }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText(/website/i)).not.toBeInTheDocument();
  });

  it("enabling seeds the fields from vendorDefaults and calls onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SocialLinksSection
        value={null}
        onChange={onChange}
        vendorDefaults={{ website: "https://vendor.example" }}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /use custom links/i }),
    );
    expect(onChange).toHaveBeenCalledWith({
      website: "https://vendor.example",
    });
  });

  it("disabling clears back to null", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SocialLinksSection
        value={{ instagram: "https://instagram.com/booth" }}
        onChange={onChange}
        vendorDefaults={{}}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /use custom links/i }),
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("opens a hint saying where the links show to customers", async () => {
    const user = userEvent.setup();
    render(
      <SocialLinksSection
        value={null}
        onChange={() => {}}
        vendorDefaults={{}}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "About social links" }),
    );
    expect(
      await screen.findByText(/order status page after they order/i),
    ).toBeInTheDocument();
  });
});
