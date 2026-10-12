import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    Promise.resolve({
      auth: { getUser: getUserMock },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      }),
    }),
}));

const getPrinterStatusMock = vi.fn();
const printkitConfiguredMock = vi.fn();
vi.mock("@/lib/printkit/client", () => ({
  getPrinterStatus: (...args: unknown[]) => getPrinterStatusMock(...args),
  printkitConfigured: () => printkitConfiguredMock(),
}));

import { GET } from "./route";

const BOOTH = "11111111-1111-1111-1111-111111111111";

function request(booth: string | null = BOOTH): Request {
  const url = booth
    ? `https://qkit.test/api/printkit/printer-status?booth=${booth}`
    : "https://qkit.test/api/printkit/printer-status";
  return new Request(url);
}

const PRINTER = {
  display_name: "Feie FP-N20H",
  catalog_id: "feie-fp-n20h",
  connector: "vendor_cloud",
  state: "online" as const,
  last_seen_at: "2026-09-20T10:00:00.000Z",
  hardware_verified: false,
};

const MANAGE_URL = "https://printkit.test/dashboard/printers#booth-loc-1";

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  maybeSingleMock.mockReset().mockResolvedValue({ data: { id: BOOTH } });
  printkitConfiguredMock.mockReset().mockReturnValue(true);
  getPrinterStatusMock.mockReset().mockResolvedValue({
    ok: true,
    data: { printer: PRINTER, manage_url: MANAGE_URL },
  });
});

describe("GET /api/printkit/printer-status", () => {
  it("rejects a signed-out caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    expect((await GET(request())).status).toBe(401);
    expect(getPrinterStatusMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed booth id", async () => {
    expect((await GET(request(null))).status).toBe(400);
    expect((await GET(request("not-a-uuid"))).status).toBe(400);
  });

  it("hides another vendor's booth behind a 404", async () => {
    maybeSingleMock.mockResolvedValue({ data: null });

    expect((await GET(request())).status).toBe(404);
    expect(getPrinterStatusMock).not.toHaveBeenCalled();
  });

  it("returns the printer printkit reports", async () => {
    const body = await (await GET(request())).json();

    expect(getPrinterStatusMock).toHaveBeenCalledWith(BOOTH);
    expect(body).toEqual({
      printer: PRINTER,
      manage_url: MANAGE_URL,
      reachable: true,
    });
  });

  it("reports printkit as unreachable rather than failing the page", async () => {
    getPrinterStatusMock.mockResolvedValue({
      ok: false,
      status: null,
      error: "Could not reach printkit",
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      printer: null,
      reachable: false,
      configured: true,
    });
  });

  it("says so when qkit itself has no printkit settings", async () => {
    printkitConfiguredMock.mockReturnValue(false);
    getPrinterStatusMock.mockResolvedValue({
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    });

    expect(await (await GET(request())).json()).toEqual({
      printer: null,
      reachable: false,
      configured: false,
    });
  });
});
