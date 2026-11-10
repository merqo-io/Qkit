import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const { drainMock } = vi.hoisted(() => ({ drainMock: vi.fn() }));
vi.mock("@/lib/proof-storage-cleanup", () => ({
  drainProofDeletions: drainMock,
}));

const SECRET = "cron-test-secret";

function call(authorization?: string) {
  return GET(
    new Request("http://localhost/api/cron/proof-storage-drain", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe("GET /api/cron/proof-storage-drain", () => {
  beforeEach(() => {
    drainMock.mockReset();
    drainMock.mockResolvedValue({ removed: 0, failed: 0, ok: true });
    vi.stubEnv("CRON_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects a missing authorization header", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await call("Bearer wrong-secret-value");
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("rejects a header without the Bearer prefix", async () => {
    const res = await call(SECRET);
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call("Bearer ");
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it("drains once and returns the result on a clean drain", async () => {
    drainMock.mockResolvedValue({ removed: 3, failed: 0, ok: true });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: 3, failed: 0, ok: true });
    expect(drainMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 with the result when any removal failed", async () => {
    drainMock.mockResolvedValue({ removed: 1, failed: 2, ok: true });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ removed: 1, failed: 2, ok: true });
  });

  it("returns 500 with the result when the drain is not ok", async () => {
    drainMock.mockResolvedValue({ removed: 0, failed: 0, ok: false });
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ removed: 0, failed: 0, ok: false });
  });

  it("returns 500 when the drain rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    drainMock.mockRejectedValue(new Error("boom"));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Drain failed" });
  });
});
