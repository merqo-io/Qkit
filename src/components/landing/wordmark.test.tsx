// @vitest-environment jsdom
import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Wordmark } from "./wordmark";

it("renders the qkit letters with the accent on the q", () => {
  const { container } = render(<Wordmark />);
  expect(container).toHaveTextContent("qkit");
  const accent = container.querySelector("span > span");
  expect(accent).toHaveTextContent("q");
  expect(accent).toHaveClass("text-primary");
});

it("sets the type size from the size prop and keeps display styling", () => {
  const { container } = render(<Wordmark size="lg" />);
  expect(container.firstElementChild).toHaveClass(
    "font-display",
    "font-semibold",
    "tracking-tight",
    "text-2xl",
  );
});
