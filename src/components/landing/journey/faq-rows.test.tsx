// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FaqRows } from "./faq-rows";

describe("FaqRows", () => {
  it("renders one ruled details row per question", () => {
    const { container } = render(
      <FaqRows
        rows={[
          { q: "One?", a: "Yes." },
          { q: "Two?", a: "Yes." },
        ]}
      />,
    );
    expect(container.querySelectorAll("details[data-faq-row]")).toHaveLength(2);
    expect(container.textContent).not.toContain("—");
    expect(
      container
        .querySelector("summary")
        ?.classList.contains("[&::-webkit-details-marker]:hidden"),
    ).toBe(true);
  });
});
