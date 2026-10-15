// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EarnLink } from "./earn-link";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("EarnLink", () => {
  it.each([
    { enabled: "false" },
    { enabled: true, program_name: {} },
    { enabled: true, program_name: "x".repeat(201) },
  ])("fails closed for malformed upstream config %j", async (body) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/loopkit\.example\/api\/merqo\//),
      expect.objectContaining({ redirect: "error" }),
    );
  });
  it("renders nothing and never fetches when NEXT_PUBLIC_LOOPKIT_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_LOOPKIT_URL", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    const result = await EarnLink({ orderId: "o1", vendorId: "v1" });
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders nothing when loopkit says not enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ enabled: false }), { status: 200 }),
    );
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link")).not.toBeInTheDocument(),
    );
  });

  it("renders a link with the program name when enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ enabled: true, program_name: "Coffee Stamps" }),
        { status: 200 },
      ),
    );
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://loopkit.example/earn?order=o1",
    );
    expect(link).toHaveTextContent(/coffee stamps/i);
  });

  it("renders nothing when the fetch fails (fail closed, never blocks the order page)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    render(
      await EarnLink({
        orderId: "o1",
        vendorId: "v1",
        loopkitBaseUrl: "https://loopkit.example",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("link")).not.toBeInTheDocument(),
    );
  });
});
