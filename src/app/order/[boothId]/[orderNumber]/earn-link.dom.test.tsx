// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getEarnOffer } = vi.hoisted(() => ({ getEarnOffer: vi.fn() }));
vi.mock("@/lib/loopkit/earn-offer", () => ({ getEarnOffer }));

import { EarnLink } from "./earn-link";

beforeEach(() =>
  getEarnOffer.mockReset().mockResolvedValue({ enabled: false }),
);
afterEach(() => vi.unstubAllEnvs());

const props = {
  orderId: "o1",
  vendorId: "v1",
  loopkitBaseUrl: "https://loopkit.example",
};

describe("EarnLink", () => {
  it("renders nothing and never asks loopkit when NEXT_PUBLIC_LOOPKIT_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_LOOPKIT_URL", "");
    const result = await EarnLink({ orderId: "o1", vendorId: "v1" });

    expect(result).toBeNull();
    expect(getEarnOffer).not.toHaveBeenCalled();
  });

  it("renders nothing when the vendor does not offer stamps", async () => {
    render((await EarnLink(props)) ?? <></>);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(getEarnOffer).toHaveBeenCalledWith("v1");
  });

  it("renders a link with the program name when enabled", async () => {
    getEarnOffer.mockResolvedValue({
      enabled: true,
      program_name: "Coffee Stamps",
    });
    render((await EarnLink(props)) ?? <></>);

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://loopkit.example/earn?order=o1",
    );
    expect(link).toHaveTextContent(/coffee stamps/i);
  });

  it("renders a link without a name when the program has none", async () => {
    getEarnOffer.mockResolvedValue({ enabled: true });
    render((await EarnLink(props)) ?? <></>);

    expect(await screen.findByRole("link")).toHaveTextContent("Earn a stamp →");
  });
});
