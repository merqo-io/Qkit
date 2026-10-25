import { afterEach, describe, expect, it, vi } from "vitest";

// next.config.ts's headers() must not send X-Frame-Options: DENY in dev: it
// applies during `next dev` too, and browsers enforce it even on localhost,
// which blocks any IDE preview pane that renders the app via <iframe>.
// Production keeps it. The CSP frame-ancestors rule lives in src/proxy.ts.
describe("next.config headers()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadHeaders() {
    vi.resetModules();
    const mod = await import("../next.config");
    const config = mod.default;
    const rules = (await config.headers?.()) ?? [];
    return rules[0].headers as { key: string; value: string }[];
  }

  it("omits X-Frame-Options in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const headers = await loadHeaders();

    expect(headers.find((h) => h.key === "X-Frame-Options")).toBeUndefined();
  });

  it("sends X-Frame-Options: DENY in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const headers = await loadHeaders();

    expect(headers.find((h) => h.key === "X-Frame-Options")?.value).toBe(
      "DENY",
    );
  });
});
