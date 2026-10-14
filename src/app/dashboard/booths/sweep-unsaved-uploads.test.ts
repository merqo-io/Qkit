import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sweepUnsavedUploads } from "./sweep-unsaved-uploads";

const { getVendorConfig } = vi.hoisted(() => ({ getVendorConfig: vi.fn() }));
vi.mock("@/lib/paykit/client", () => ({ getVendorConfig }));

const PUBLIC = "https://proj.supabase.co/storage/v1/object/public/booth-images";
const NOW = Date.parse("2026-09-22T12:00:00Z");
const OLD = "2026-09-20T12:00:00Z";
const RECENT = "2026-09-22T11:00:00Z";
const USER = {
  id: "v1",
  user_metadata: { avatar_url: `${PUBLIC}/v1/avatar.webp` },
};

type Listed = { name: string; created_at: string | null };
type Client = Parameters<typeof sweepUnsavedUploads>[0];

function makeSupabase({
  booths = [] as unknown[],
  boothsError = null as unknown,
  pages = [[]] as Listed[][],
  listError = null as unknown,
  removeError = null as unknown,
} = {}) {
  const list = vi.fn((_folder: string, opts: { offset: number }) =>
    Promise.resolve({
      data: listError ? null : (pages[opts.offset / 1000] ?? []),
      error: listError,
    }),
  );
  const remove = vi.fn((_paths: string[]) =>
    Promise.resolve({ error: removeError }),
  );
  const eq = vi.fn((_col: string, _val: string) => ({
    order: () => ({
      range: (from: number, to: number) =>
        Promise.resolve({
          data: boothsError
            ? null
            : booths.slice(from, Math.min(to + 1, from + 2)),
          error: boothsError,
        }),
    }),
  }));
  const supabase = {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })),
    storage: { from: vi.fn(() => ({ list, remove })) },
  } as unknown as Client;
  return { supabase, list, remove, eq };
}

function paykitOk(qrImageUrl: string | null = null) {
  getVendorConfig.mockResolvedValue({ ok: true, data: { qrImageUrl } });
}

beforeEach(() => {
  getVendorConfig.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("sweepUnsavedUploads", () => {
  it("retains images referenced beyond the server's first page", async () => {
    paykitOk();
    const { supabase, remove } = makeSupabase({
      booths: [
        { image_url: null, menu_items: [] },
        { image_url: null, menu_items: [] },
        { image_url: `${PUBLIC}/v1/keep.webp`, menu_items: [] },
      ],
      pages: [
        [
          { name: "keep.webp", created_at: OLD },
          { name: "orphan.webp", created_at: OLD },
        ],
      ],
    });
    await sweepUnsavedUploads(supabase, USER, NOW);
    expect(remove).toHaveBeenCalledWith(["v1/orphan.webp"]);
  });
  it("deletes only old objects nothing references", async () => {
    paykitOk(`${PUBLIC}/v1/qr.webp`);
    const { supabase, list, remove, eq } = makeSupabase({
      booths: [
        {
          image_url: `${PUBLIC}/v1/banner.webp`,
          menu_items: [{ image_url: `${PUBLIC}/v1/item.webp` }],
        },
      ],
      pages: [
        [
          { name: "banner.webp", created_at: OLD },
          { name: "item.webp", created_at: OLD },
          { name: "avatar.webp", created_at: OLD },
          { name: "qr.webp", created_at: OLD },
          { name: "abandoned.webp", created_at: OLD },
          { name: "in-progress.webp", created_at: RECENT },
        ],
      ],
    });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(getVendorConfig).toHaveBeenCalledWith("v1");
    expect(eq).toHaveBeenCalledWith("vendor_id", "v1");
    expect(list).toHaveBeenCalledWith("v1", { limit: 1000, offset: 0 });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["v1/abandoned.webp"]);
  });

  it("keeps a payment QR uploaded here before payment setup moved to paykit", async () => {
    paykitOk(`${PUBLIC}/v1/legacy-qr.webp`);
    const { supabase, remove } = makeSupabase({
      pages: [
        [
          { name: "legacy-qr.webp", created_at: OLD },
          { name: "abandoned.webp", created_at: OLD },
        ],
      ],
    });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(remove).toHaveBeenCalledWith(["v1/abandoned.webp"]);
  });

  it("does nothing when paykit is unreachable, so a live QR is never deleted", async () => {
    getVendorConfig.mockResolvedValue({ ok: false, status: 503, error: "x" });
    const { supabase, list, remove } = makeSupabase({
      pages: [[{ name: "maybe-qr.webp", created_at: OLD }]],
    });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("does nothing when the booths read fails", async () => {
    paykitOk();
    const { supabase, list, remove } = makeSupabase({
      boothsError: { message: "boom" },
      pages: [[{ name: "banner.webp", created_at: OLD }]],
    });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("does nothing when listing the folder fails", async () => {
    paykitOk();
    const { supabase, remove } = makeSupabase({ listError: { message: "x" } });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(remove).not.toHaveBeenCalled();
  });

  it("pages through a full folder listing", async () => {
    paykitOk();
    const full = Array.from({ length: 1000 }, (_, i) => ({
      name: `keep-${i}.webp`,
      created_at: RECENT,
    }));
    const { supabase, list, remove } = makeSupabase({
      pages: [full, [{ name: "abandoned.webp", created_at: OLD }]],
    });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith("v1", { limit: 1000, offset: 1000 });
    expect(remove).toHaveBeenCalledWith(["v1/abandoned.webp"]);
  });

  it("skips the delete call when nothing is abandoned", async () => {
    paykitOk();
    const { supabase, remove } = makeSupabase({
      pages: [[{ name: "fresh.webp", created_at: RECENT }]],
    });

    await sweepUnsavedUploads(supabase, USER, NOW);

    expect(remove).not.toHaveBeenCalled();
  });

  it("treats a non-string avatar as no avatar", async () => {
    paykitOk();
    const { supabase, remove } = makeSupabase({
      pages: [[{ name: "avatar.webp", created_at: OLD }]],
    });

    await sweepUnsavedUploads(
      supabase,
      { id: "v1", user_metadata: { avatar_url: 42 } },
      NOW,
    );

    expect(remove).toHaveBeenCalledWith(["v1/avatar.webp"]);
  });

  it("never throws, logging a failed delete or an unexpected error", async () => {
    paykitOk();
    const { supabase } = makeSupabase({
      pages: [[{ name: "abandoned.webp", created_at: OLD }]],
      removeError: { message: "denied" },
    });

    await expect(sweepUnsavedUploads(supabase, USER, NOW)).resolves.toBe(
      undefined,
    );
    expect(console.error).toHaveBeenCalledWith(
      "sweepUnsavedUploads failed",
      "denied",
    );

    getVendorConfig.mockRejectedValue(new Error("network"));
    await expect(sweepUnsavedUploads(supabase, USER, NOW)).resolves.toBe(
      undefined,
    );
    expect(console.error).toHaveBeenCalledWith(
      "sweepUnsavedUploads failed",
      "network",
    );
  });
});
