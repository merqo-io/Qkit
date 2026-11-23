// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./feedback-actions", () => ({ submitHelpFeedback: vi.fn() }));

import { ArticleFeedback } from "./article-feedback";
import type { HelpFeedbackResult } from "@/lib/help/feedback";

const ok = (): Promise<HelpFeedbackResult> => Promise.resolve({ ok: true });

describe("ArticleFeedback", () => {
  it("records a Yes vote and says thanks", async () => {
    const submit = vi.fn(ok);
    render(
      <ArticleFeedback slug="payments" initialVote={null} submit={submit} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(submit).toHaveBeenCalledWith({ slug: "payments", helpful: true });
    expect(
      await screen.findByText("Thanks for the feedback."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("asks what was missing on No and sends the comment", async () => {
    const submit = vi.fn(ok);
    render(
      <ArticleFeedback slug="payments" initialVote={null} submit={submit} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(submit).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText("What was missing?"),
      "no QR step",
    );
    expect(screen.getByText("10/500")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(submit).toHaveBeenCalledWith({
      slug: "payments",
      helpful: false,
      comment: "no QR step",
    });
    expect(
      await screen.findByText("Thanks for the feedback."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("What was missing?"),
    ).not.toBeInTheDocument();
  });

  it("restores a saved vote and lets the vendor change it", async () => {
    const submit = vi.fn(ok);
    render(
      <ArticleFeedback
        slug="payments"
        initialVote={{ helpful: false, comment: "old" }}
        submit={submit}
      />,
    );
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(submit).toHaveBeenCalledWith({ slug: "payments", helpful: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("shows an inline error when saving fails", async () => {
    const submit = vi.fn(
      (): Promise<HelpFeedbackResult> =>
        Promise.resolve({ ok: false, error: "failed" }),
    );
    render(
      <ArticleFeedback slug="payments" initialVote={null} submit={submit} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save your feedback",
    );
    expect(
      screen.queryByText("Thanks for the feedback."),
    ).not.toBeInTheDocument();
  });

  it("keeps the saved vote until a No is actually sent", async () => {
    const submit = vi.fn(ok);
    render(
      <ArticleFeedback
        slug="payments"
        initialVote={{ helpful: true, comment: null }}
        submit={submit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByLabelText("What was missing?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "No" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
});
