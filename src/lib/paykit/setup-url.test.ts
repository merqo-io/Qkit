import { describe, expect, it } from "vitest";
import { paykitSetupUrl } from "./setup-url";

describe("paykitSetupUrl", () => {
  it("points at the setup page of the given base", () => {
    expect(paykitSetupUrl(null, "https://paykit.example")).toBe(
      "https://paykit.example/dashboard/config",
    );
  });

  it("carries the way back, percent-encoded", () => {
    const href = paykitSetupUrl(
      "http://localhost:3000/dashboard/booths/b-1/qr",
      "https://paykit.example",
    );
    expect(href).toContain(
      "return_to=http%3A%2F%2Flocalhost%3A3000%2Fdashboard%2Fbooths%2Fb-1%2Fqr",
    );
    expect(new URL(href).searchParams.get("return_to")).toBe(
      "http://localhost:3000/dashboard/booths/b-1/qr",
    );
  });

  it("keeps a query string in the way back from splitting the URL", () => {
    const href = paykitSetupUrl("https://x.merqo.io/a?b=1&c=2", "https://p.io");
    expect(new URL(href).searchParams.get("return_to")).toBe(
      "https://x.merqo.io/a?b=1&c=2",
    );
    expect(new URL(href).searchParams.get("c")).toBeNull();
  });
});
