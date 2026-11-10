import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainProofDeletions } from "./proof-storage-cleanup";

type Row = {
  id: number;
  bucket: string;
  path: string;
  attempts: number;
};

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  selectError: null as { message: string } | null,
  removeResult: { error: null } as {
    error: { message: string; statusCode?: string } | null;
  },
  removeSpy: vi.fn(),
  deletedIds: [] as number[],
  updates: [] as { id: number; patch: Record<string, unknown> }[],
  clientThrows: false,
  ltCalls: [] as [string, number][],
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  removeByBucket: {} as Record<string, { message: string } | null>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => {
    if (h.clientThrows) throw new Error("Missing SUPABASE_SECRET_KEY");
    return {
      from: () => ({
        select: () => ({
          lt: (col: string, value: number) => {
            h.ltCalls.push([col, value]);
            return {
              order: () => ({
                limit: () =>
                  Promise.resolve({ data: h.rows, error: h.selectError }),
              }),
            };
          },
        }),
        delete: () => ({
          in: (_col: string, ids: number[]) => {
            h.deletedIds.push(...ids);
            return Promise.resolve({ error: h.deleteError });
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: number) => {
            h.updates.push({ id, patch });
            return Promise.resolve({ error: h.updateError });
          },
        }),
      }),
      storage: {
        from: (bucket: string) => ({
          remove: (paths: string[]) => {
            h.removeSpy(bucket, paths);
            return Promise.resolve(
              bucket in h.removeByBucket
                ? { error: h.removeByBucket[bucket] }
                : h.removeResult,
            );
          },
        }),
      },
    };
  },
}));

beforeEach(() => {
  h.rows = [
    { id: 1, bucket: "payment-proofs", path: "a/1.webp", attempts: 0 },
    { id: 2, bucket: "payment-proofs", path: "a/2.webp", attempts: 2 },
  ];
  h.selectError = null;
  h.removeResult = { error: null };
  h.removeSpy.mockReset();
  h.deletedIds = [];
  h.updates = [];
  h.clientThrows = false;
  h.ltCalls = [];
  h.updateError = null;
  h.deleteError = null;
  h.removeByBucket = {};
});

describe("drainProofDeletions", () => {
  it("removes queued objects in one batch and clears their queue rows", async () => {
    const result = await drainProofDeletions();
    expect(result).toEqual({ removed: 2, failed: 0, ok: true });
    expect(h.removeSpy).toHaveBeenCalledTimes(1);
    expect(h.removeSpy).toHaveBeenCalledWith("payment-proofs", [
      "a/1.webp",
      "a/2.webp",
    ]);
    expect(h.deletedIds).toEqual([1, 2]);
    expect(h.updates).toEqual([]);
  });

  it("keeps the rows and counts an attempt when the bucket is not found", async () => {
    h.removeResult = { error: { message: "Bucket not found" } };
    const result = await drainProofDeletions();
    expect(result).toEqual({ removed: 0, failed: 2, ok: true });
    expect(h.deletedIds).toEqual([]);
    expect(h.updates.map((u) => u.patch.attempts)).toEqual([1, 3]);
  });

  it("only reads rows under the attempts cap", async () => {
    await drainProofDeletions();
    expect(h.ltCalls).toEqual([["attempts", 5]]);
  });

  it("does not throw when recording a failed attempt fails", async () => {
    h.removeResult = { error: { message: "storage unavailable" } };
    h.updateError = { message: "db down" };
    await expect(drainProofDeletions()).resolves.toEqual({
      removed: 0,
      failed: 2,
      ok: true,
    });
  });

  it("increments attempts and records the error on a real failure", async () => {
    h.removeResult = { error: { message: "storage unavailable" } };
    const result = await drainProofDeletions();
    expect(result).toEqual({ removed: 0, failed: 2, ok: true });
    expect(h.deletedIds).toEqual([]);
    expect(h.updates).toEqual([
      { id: 1, patch: { attempts: 1, last_error: "storage unavailable" } },
      { id: 2, patch: { attempts: 3, last_error: "storage unavailable" } },
    ]);
  });

  it("does nothing when the queue is empty", async () => {
    h.rows = [];
    const result = await drainProofDeletions();
    expect(result).toEqual({ removed: 0, failed: 0, ok: true });
    expect(h.removeSpy).not.toHaveBeenCalled();
  });

  it("counts removed and failed rows per bucket", async () => {
    h.rows = [
      { id: 1, bucket: "payment-proofs", path: "a/1.webp", attempts: 0 },
      { id: 2, bucket: "other", path: "b/2.webp", attempts: 0 },
      { id: 3, bucket: "other", path: "b/3.webp", attempts: 0 },
    ];
    h.removeByBucket = { other: { message: "nope" } };
    const result = await drainProofDeletions();
    expect(result).toEqual({ removed: 1, failed: 2, ok: true });
    expect(h.deletedIds).toEqual([1]);
  });

  it("reports not ok and does not count rows when the queue clear fails", async () => {
    h.deleteError = { message: "db down" };
    const result = await drainProofDeletions();
    expect(result).toEqual({ removed: 0, failed: 0, ok: false });
  });

  it("never throws when the queue read, the client or storage fails", async () => {
    h.selectError = { message: "db down" };
    await expect(drainProofDeletions()).resolves.toEqual({
      removed: 0,
      failed: 0,
      ok: false,
    });
    h.selectError = null;
    h.clientThrows = true;
    await expect(drainProofDeletions()).resolves.toEqual({
      removed: 0,
      failed: 0,
      ok: false,
    });
    h.clientThrows = false;
    h.removeSpy.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(drainProofDeletions()).resolves.toEqual({
      removed: 0,
      failed: 0,
      ok: false,
    });
  });
});
