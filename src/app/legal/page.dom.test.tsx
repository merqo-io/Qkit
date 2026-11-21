// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./accept/actions", () => ({ acceptLegalTerms: vi.fn() }));

import TermsPage, { metadata as termsMetadata } from "./terms/page";
import PrivacyPage, { metadata as privacyMetadata } from "./privacy/page";
import LegalAcceptPage from "./accept/page";

describe("legal pages", () => {
  it("titles the terms and privacy pages from the shared metadata", () => {
    expect(termsMetadata).toEqual({ title: "Terms of Service" });
    expect(privacyMetadata).toEqual({ title: "Privacy Policy" });
  });

  it("renders the terms with a wordmark linking home", () => {
    render(<TermsPage />);
    expect(screen.getByRole("link", { name: "qkit home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the privacy policy with a wordmark linking home", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "qkit home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("gates the accept submit on the checkbox and sanitises next", async () => {
    const ui = await LegalAcceptPage({
      searchParams: Promise.resolve({ next: "https://evil.example" }),
    });
    const { container } = render(ui);
    const submit = screen.getByRole("button", { name: "Continue" });
    expect(submit).toBeDisabled();
    expect(
      container.querySelector<HTMLInputElement>('input[name="next"]')?.value,
    ).toBe("/dashboard");

    const user = userEvent.setup();
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("checkbox"),
    });
    expect(submit).toBeEnabled();
  });
});
