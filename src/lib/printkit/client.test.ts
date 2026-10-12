import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPrintJob,
  getPrinterStatus,
  registerPrintLocation,
} from "./client";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe("createPrintJob", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns ok:false when PRINTKIT_KIT_SECRET is unset", async () => {
    delete process.env.PRINTKIT_KIT_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      boothId: "booth-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when NEXT_PUBLIC_PRINTKIT_URL is unset (fails closed, never guesses a host)", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      boothId: "booth-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({
      ok: false,
      status: null,
      error: "Printing is not configured yet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a qkit:secret bearer token and the correct payload shape", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "job-1" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      boothId: "booth-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({ ok: true, data: { id: "job-1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://printkit.test/api/v1/print-jobs");
    expect(init.headers.Authorization).toBe("Bearer qkit:s3cret");
    expect(JSON.parse(init.body)).toEqual({
      vendor_id: "vendor-1",
      payload: { customer_name: "Ada", order_number: "0007" },
      source_ref: "order-1",
      location_ref: "booth-1",
    });
  });

  it("collapses a non-2xx response to ok:false without throwing", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          error: "A print job already exists for this order.",
        }),
    });

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      boothId: "booth-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "A print job already exists for this order.",
    });
  });

  it("collapses a network error to ok:false without throwing", async () => {
    process.env.PRINTKIT_KIT_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await createPrintJob({
      vendorId: "vendor-1",
      orderId: "order-1",
      boothId: "booth-1",
      customerName: "Ada",
      orderNumber: "0007",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network down");
  });
});

describe("registerPrintLocation", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("does nothing (no fetch) when PRINTKIT_KIT_SECRET is unset", async () => {
    delete process.env.PRINTKIT_KIT_SECRET;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await registerPrintLocation({
      vendorId: "vendor-1",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing (no fetch) when NEXT_PUBLIC_PRINTKIT_URL is unset", async () => {
    process.env.PRINTKIT_KIT_SECRET = "secret";
    delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await registerPrintLocation({
      vendorId: "vendor-1",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to /api/v1/print-locations with the right body and bearer header", async () => {
    process.env.PRINTKIT_KIT_SECRET = "secret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.example";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "loc-1" }), { status: 201 }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await registerPrintLocation({
      vendorId: "vendor-1",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result).toEqual({ ok: true, data: { id: "loc-1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/print-locations");
    expect(init.headers.Authorization).toBe("Bearer qkit:secret");
    expect(JSON.parse(init.body)).toEqual({
      vendor_id: "vendor-1",
      source_ref: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });
  });

  it("never throws when the fetch itself rejects", async () => {
    process.env.PRINTKIT_KIT_SECRET = "secret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.example";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await registerPrintLocation({
      vendorId: "vendor-1",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result.ok).toBe(false);
  });

  // Upstream error pages can be HTML rather than the expected JSON.
  it("returns ok:false without throwing when the response body isn't valid JSON", async () => {
    process.env.PRINTKIT_KIT_SECRET = "secret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.example";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
    });

    const result = await registerPrintLocation({
      vendorId: "vendor-1",
      sourceRef: "booth-1",
      label: "Kopitiam Cart",
      active: true,
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "printkit returned an invalid response",
    });
  });
});

describe("getPrinterStatus", () => {
  const PRINTER = {
    display_name: "Feie FP-N20H",
    catalog_id: "feie-fp-n20h",
    connector: "vendor_cloud",
    state: "online",
    last_seen_at: "2026-09-20T10:00:00.000Z",
    hardware_verified: false,
  };
  const ROW_URL = "https://printkit.example/dashboard/printers#booth-loc-1";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PRINTKIT_KIT_SECRET = "secret";
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.example";
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  function respondsWith(body: unknown) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it("asks printkit about this booth and returns the printer with its link", async () => {
    const fetchMock = respondsWith({ printer: PRINTER, manage_url: ROW_URL });

    const result = await getPrinterStatus("booth 1");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://printkit.example/api/v1/print-locations/status?source_ref=booth%201",
    );
    expect(result).toEqual({
      ok: true,
      data: { printer: PRINTER, manage_url: ROW_URL },
    });
  });

  it("reads an answer with no manage_url as having no link", async () => {
    respondsWith({ printer: null });

    expect(await getPrinterStatus("booth-1")).toEqual({
      ok: true,
      data: { printer: null, manage_url: null },
    });
  });

  it.each([
    ["a javascript: URL", "javascript:alert(1)"],
    ["a relative path", "/dashboard/printers"],
    ["a number", 42],
    ["null", null],
  ])(
    "drops %s sent as manage_url and keeps the status",
    async (_, manageUrl) => {
      respondsWith({ printer: PRINTER, manage_url: manageUrl });

      expect(await getPrinterStatus("booth-1")).toEqual({
        ok: true,
        data: { printer: PRINTER, manage_url: null },
      });
    },
  );

  it("keeps an http link, which a local printkit sends", async () => {
    respondsWith({
      printer: null,
      manage_url: "http://localhost:3001/dashboard/printers",
    });

    expect(await getPrinterStatus("booth-1")).toEqual({
      ok: true,
      data: {
        printer: null,
        manage_url: "http://localhost:3001/dashboard/printers",
      },
    });
  });
});
