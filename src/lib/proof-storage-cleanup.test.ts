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
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => {
    if (h.clientThrows) throw new Error("Missing SUPABASE_SECRET_KEY");
    return {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: h.rows, error: h.selectError }),
          }),
        }),
        delete: () => ({
          in: (_col: string, ids: number[]) => {
            h.deletedIds.push(...ids);
            return Promise.resolve({ error: null });
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: number) => {
            h.updates.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        }),
      }),
      storage: {
        from: (bucket: string) => ({
          remove: (paths: string[]) => {
            h.removeSpy(bucket, paths);
            return Promise.resolve(h.removeResult);
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
});

describe("drainProofDeletions", () => {
  it("removes queued objects in one batch and clears their queue rows", async () => {
    await drainProofDeletions();
    expect(h.removeSpy).toHaveBeenCalledTimes(1);
    expect(h.removeSpy).toHaveBeenCalledWith("payment-proofs", [
      "a/1.webp",
      "a/2.webp",
    ]);
    expect(h.deletedIds).toEqual([1, 2]);
    expect(h.updates).toEqual([]);
  });

  it("treats a not-found error as success", async () => {
    h.removeResult = { error: { message: "Object not found" } };
    await drainProofDeletions();
    expect(h.deletedIds).toEqual([1, 2]);
    expect(h.updates).toEqual([]);
  });

  it("increments attempts and records the error on a real failure", async () => {
    h.removeResult = { error: { message: "storage unavailable" } };
    await drainProofDeletions();
    expect(h.deletedIds).toEqual([]);
    expect(h.updates).toEqual([
      { id: 1, patch: { attempts: 1, last_error: "storage unavailable" } },
      { id: 2, patch: { attempts: 3, last_error: "storage unavailable" } },
    ]);
  });

  it("does nothing when the queue is empty", async () => {
    h.rows = [];
    await drainProofDeletions();
    expect(h.removeSpy).not.toHaveBeenCalled();
  });

  it("never throws when the queue read, the client or storage fails", async () => {
    h.selectError = { message: "db down" };
    await expect(drainProofDeletions()).resolves.toBeUndefined();
    h.selectError = null;
    h.clientThrows = true;
    await expect(drainProofDeletions()).resolves.toBeUndefined();
    h.clientThrows = false;
    h.removeSpy.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(drainProofDeletions()).resolves.toBeUndefined();
  });
});
