import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveSupportMessage, setBanner, setVendorShowcase } from "./actions";

// Mock the SERVICE client's fluent chains + the admin gate. `from(table)`
// dispatches per table so each terminal can be driven independently:
//   admin_audit       - insert (awaited terminal -> { error })
//   platform_settings - update->eq (awaited terminal -> { error })
const {
  requireAdminMock,
  auditInsert,
  supportMsgUpdateSingle,
  supportMsgEq,
  platformSettingsEq,
  updateTagMock,
  vendorUpdate,
  vendorSingle,
} = vi.hoisted(() => ({
  updateTagMock: vi.fn(),
  vendorUpdate: vi.fn(),
  vendorSingle: vi.fn(),
  requireAdminMock: vi.fn(),
  auditInsert: vi.fn(),
  supportMsgUpdateSingle: vi.fn(),
  supportMsgEq: vi.fn(),
  platformSettingsEq: vi.fn(),
}));

vi.mock("@/lib/admin/access", () => ({ requireAdmin: requireAdminMock }));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: updateTagMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: (table: string) => {
        switch (table) {
          case "admin_audit":
            return { insert: auditInsert };
          case "platform_settings":
            return { update: () => ({ eq: platformSettingsEq }) };
          case "vendors":
            return {
              update: (patch: unknown) => {
                vendorUpdate(patch);
                return {
                  eq: () => ({ select: () => ({ maybeSingle: vendorSingle }) }),
                };
              },
            };
          default:
            throw new Error(`unexpected table ${table}`);
        }
      },
      schema: (name: string) => {
        if (name !== "merqo") throw new Error(`unexpected schema ${name}`);
        return {
          from: (table: string) => {
            if (table !== "support_messages") {
              throw new Error(`unexpected merqo table ${table}`);
            }
            const chain = {
              eq: (column: string, value: string) => {
                supportMsgEq(column, value);
                return chain;
              },
              select: () => ({ maybeSingle: supportMsgUpdateSingle }),
            };
            return { update: () => chain };
          },
        };
      },
    }),
}));

const VENDOR = "00000000-0000-4000-8000-000000000001";
const ADMIN = "admin-1";

beforeEach(() => {
  supportMsgEq.mockReset();
  requireAdminMock.mockReset().mockResolvedValue({ user: { id: ADMIN } });
  auditInsert.mockReset().mockResolvedValue({ error: null });
  supportMsgUpdateSingle
    .mockReset()
    .mockResolvedValue({ data: { user_id: VENDOR }, error: null });
  platformSettingsEq.mockReset().mockResolvedValue({ error: null });
  updateTagMock.mockReset();
  vendorUpdate.mockReset();
  vendorSingle
    .mockReset()
    .mockResolvedValue({ data: { id: VENDOR }, error: null });
});

describe("setVendorShowcase", () => {
  it("sets the flag, audits it and busts the showcase cache", async () => {
    const res = await setVendorShowcase({ id: VENDOR, show: true });
    expect(res).toEqual({ success: true });
    expect(vendorUpdate).toHaveBeenCalledWith({ showcase_on_landing: true });
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: "set_vendor_showcase",
        target_id: VENDOR,
        detail: { showcase_on_landing: true },
      }),
    );
    expect(updateTagMock).toHaveBeenCalledWith("showcase-vendors");
  });

  it("rejects an invalid id without writing", async () => {
    const res = await setVendorShowcase({ id: "nope", show: true });
    expect(res.success).toBe(false);
    expect(vendorUpdate).not.toHaveBeenCalled();
  });

  it("fails without auditing when no row matches", async () => {
    vendorSingle.mockResolvedValue({ data: null, error: null });
    const res = await setVendorShowcase({ id: VENDOR, show: false });
    expect(res.success).toBe(false);
    expect(auditInsert).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});

describe("resolveSupportMessage", () => {
  const MESSAGE = "00000000-0000-4000-8000-0000000000bb";

  it("marks it resolved and audits against the message's vendor", async () => {
    const res = await resolveSupportMessage({ id: MESSAGE });
    expect(res).toEqual({ success: true });
    expect(supportMsgEq).toHaveBeenCalledWith("kit_slug", "qkit");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: "resolve_support_message",
        target_id: VENDOR,
        detail: { message_id: MESSAGE },
      }),
    );
  });

  it("fails cleanly when no row matches (already resolved / bad id)", async () => {
    supportMsgUpdateSingle.mockResolvedValue({ data: null, error: null });
    const res = await resolveSupportMessage({ id: MESSAGE });
    expect(res).toEqual({ success: false, error: "Could not resolve" });
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid id before touching the DB", async () => {
    const res = await resolveSupportMessage({ id: "nope" });
    expect(res).toEqual({ success: false, error: "Invalid input" });
    expect(supportMsgUpdateSingle).not.toHaveBeenCalled();
  });
});

describe("setBanner", () => {
  it("updates the singleton row and audits the change", async () => {
    const res = await setBanner({
      banner_enabled: true,
      banner_message: "Scheduled maintenance 10pm-11pm SGT",
    });
    expect(res).toEqual({ success: true });
    expect(platformSettingsEq).toHaveBeenCalledWith("id", 1);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: "set_banner",
        detail: {
          banner_enabled: true,
          banner_message: "Scheduled maintenance 10pm-11pm SGT",
        },
      }),
    );
  });

  it("rejects a message over 280 chars before touching the DB", async () => {
    const res = await setBanner({
      banner_enabled: true,
      banner_message: "x".repeat(281),
    });
    expect(res).toEqual({ success: false, error: "Invalid input" });
    expect(platformSettingsEq).not.toHaveBeenCalled();
  });

  it("surfaces a DB error instead of claiming success", async () => {
    platformSettingsEq.mockResolvedValue({ error: { message: "boom" } });
    const res = await setBanner({
      banner_enabled: false,
      banner_message: "",
    });
    expect(res).toEqual({ success: false, error: "Could not update banner" });
    expect(auditInsert).not.toHaveBeenCalled();
  });
});
