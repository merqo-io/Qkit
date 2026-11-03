import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(async () => ({ data: true, error: null })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

const { getOrCreateVendorProfileMock } = vi.hoisted(() => ({
  getOrCreateVendorProfileMock: vi.fn(),
}));
vi.mock("@/lib/merqo/vendor-profile", () => ({
  getOrCreateVendorProfile: getOrCreateVendorProfileMock,
}));

const { recordAuditMock } = vi.hoisted(() => ({
  recordAuditMock: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: recordAuditMock,
}));

import { POST } from "@/app/api/merqo/vendor-provision/route";

const USER_ID = "11111111-1111-1111-8111-111111111111";

function req(body: unknown, auth?: string) {
  return new Request("http://localhost/api/merqo/vendor-provision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

function vendorsTable(opts: {
  insertError?: { code: string; message: string } | null;
}) {
  return {
    insert: () => Promise.resolve({ error: opts.insertError ?? null }),
  };
}

describe("POST /api/merqo/vendor-provision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MERQO_PROVISION_SECRET", "test-secret");
    getOrCreateVendorProfileMock.mockResolvedValue({});
    recordAuditMock.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("401 when the bearer is missing", async () => {
    const res = await POST(req({ user_id: USER_ID }));
    expect(res.status).toBe(401);
  });

  it("400 when user_id is not a UUID", async () => {
    const res = await POST(
      req({ user_id: "not-a-uuid" }, "Bearer test-secret"),
    );
    expect(res.status).toBe(400);
  });

  it("400 on a malformed JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/merqo/vendor-provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
        body: "{not valid json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a new vendor row, seeds the profile, returns ok", async () => {
    fromMock.mockReturnValue(vendorsTable({ insertError: null }));
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: false,
    });
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      null,
    );
    expect(recordAuditMock).toHaveBeenCalledWith({
      admin_id: USER_ID,
      action: "merqo_vendor_provision",
      target_id: USER_ID,
      detail: {
        actor: "merqo_system",
        already_existed: false,
      },
    });
  });

  it("second call (already exists) is a no-op — does not re-seed the profile, still audits", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23505", message: "duplicate key" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: true,
    });
    expect(getOrCreateVendorProfileMock).not.toHaveBeenCalled();
    expect(recordAuditMock).toHaveBeenCalledWith({
      admin_id: USER_ID,
      action: "merqo_vendor_provision",
      target_id: USER_ID,
      detail: {
        actor: "merqo_system",
        already_existed: true,
      },
    });
  });

  it("400 on a foreign-key violation (unknown user_id)", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23503", message: "fk violation" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(400);
  });

  it("500 when the profile seed throws", async () => {
    fromMock.mockReturnValue(vendorsTable({ insertError: null }));
    getOrCreateVendorProfileMock.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(500);
  });

  it("500 on a generic insert error (not a FK or unique violation)", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23514", message: "check constraint violated" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(500);
  });

  it("never audits when the route fails before a successful provision", async () => {
    fromMock.mockReturnValue(
      vendorsTable({
        insertError: { code: "23503", message: "fk violation" },
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(400);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});
