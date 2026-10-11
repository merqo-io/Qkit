import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "fraunces" }),
  Hanken_Grotesk: () => ({ variable: "hanken" }),
  Space_Mono: () => ({ variable: "space" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: createClient }));
import RootLayout from "./layout";
import { forgetPlatformSettings } from "@/lib/platform-settings";

beforeEach(() => forgetPlatformSettings());

describe("optional root maintenance banner", () => {
  it("keeps the application available when client creation rejects", async () => {
    createClient.mockRejectedValueOnce(new Error("Offline"));
    const root = await RootLayout({ children: "Content" });
    expect(root.props.children.props.children[1].props).toEqual({
      enabled: false,
      message: "",
    });
  });
  it("keeps the application available when the banner query rejects", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => {
        throw new Error("Offline");
      },
    };
    createClient.mockResolvedValueOnce({ from: () => query });
    const root = await RootLayout({ children: "Content" });
    expect(root.props.children.props.children[1].props).toEqual({
      enabled: false,
      message: "",
    });
  });
  it("reads the banner once for requests close together, with a client made for each", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { banner_enabled: true, banner_message: "Back at 3pm" },
      error: null,
    }));
    const query = { select: () => query, eq: () => query, maybeSingle };
    createClient.mockClear();
    createClient.mockResolvedValue({ from: () => query });

    const first = await RootLayout({ children: "Content" });
    const second = await RootLayout({ children: "Content" });

    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(2);
    for (const root of [first, second])
      expect(root.props.children.props.children[1].props).toEqual({
        enabled: true,
        message: "Back at 3pm",
      });
  });
});
