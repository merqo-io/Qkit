// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { TooltipProvider } from "@merqo/ui/primitives";
import { BoothList } from "./booth-list";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("BoothList on the server", () => {
  it("renders without a window", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(
      <TooltipProvider>
        <BoothList
          maxBooths={1}
          booths={[
            {
              id: "b1",
              name: "Kopi Cart",
              is_active: true,
              image_url: null,
              itemCount: 3,
              paused: false,
              shortCode: "abc123",
            },
          ]}
        />
      </TooltipProvider>,
    );
    expect(html).toContain("Kopi Cart");
  });
});
