import { describe, it, expect } from "vitest";
import {
  boothImagePaths,
  orphanedImagePaths,
  failedSaveUploadPaths,
  unsavedUploadPaths,
  uploadedPaths,
  UNSAVED_UPLOAD_GRACE_MS,
} from "./images";

const BASE = "https://proj.supabase.co/storage/v1/object/public/booth-images/";

describe("boothImagePaths", () => {
  it("decodes percent-encoded paths and ignores other buckets", () => {
    expect(
      boothImagePaths({
        image_url: `${BASE}vendor1/a%20b.webp`,
        menu_items: [
          {
            image_url:
              "https://proj.supabase.co/storage/v1/object/public/vendor-images/v1/x.webp",
          },
          { image_url: "https://example.com/x.png" },
          { image_url: BASE },
        ],
      }),
    ).toEqual(["vendor1/a b.webp"]);
  });

  it("collects the banner and each menu item photo, deduped, uploads only", () => {
    const paths = boothImagePaths({
      image_url: `${BASE}v1/banner.webp`,
      menu_items: [
        { image_url: `${BASE}v1/item1.webp` },
        { image_url: "/seed/local.png" }, // seed → skipped
        { image_url: `${BASE}v1/item1.webp` }, // dup → collapsed
        { image_url: null },
        {},
      ],
    });
    expect(paths.sort()).toEqual(["v1/banner.webp", "v1/item1.webp"]);
  });

  it("tolerates a null banner and a non-array menu", () => {
    expect(boothImagePaths({ image_url: null, menu_items: null })).toEqual([]);
  });
});

describe("orphanedImagePaths", () => {
  it("returns paths dropped from before → after", () => {
    const before = {
      image_url: `${BASE}v1/old-banner.webp`,
      menu_items: [{ image_url: `${BASE}v1/keep.webp` }],
    };
    const after = {
      image_url: `${BASE}v1/new-banner.webp`,
      menu_items: [{ image_url: `${BASE}v1/keep.webp` }],
    };
    expect(orphanedImagePaths(before, after)).toEqual(["v1/old-banner.webp"]);
  });

  it("returns nothing when the image set is unchanged", () => {
    const row = { image_url: `${BASE}v1/b.webp`, menu_items: [] };
    expect(orphanedImagePaths(row, row)).toEqual([]);
  });
});

describe("failedSaveUploadPaths", () => {
  it("returns the vendor's own uploads, deduped", () => {
    expect(
      failedSaveUploadPaths(
        [`${BASE}v1/a.webp`, `${BASE}v1/b.webp`, `${BASE}v1/a.webp`],
        "v1",
      ),
    ).toEqual(["v1/a.webp", "v1/b.webp"]);
  });

  it("drops another vendor's folder, other buckets and external URLs", () => {
    expect(
      failedSaveUploadPaths(
        [
          `${BASE}v2/a.webp`,
          "https://proj.supabase.co/storage/v1/object/public/vendor-images/v1/x.webp",
          "https://example.com/x.png",
        ],
        "v1",
      ),
    ).toEqual([]);
  });
});

describe("uploadedPaths", () => {
  it("keeps only booth-images uploads", () => {
    expect(
      uploadedPaths([
        `${BASE}v1/avatar.webp`,
        "https://lh3.googleusercontent.com/a/photo",
        null,
        undefined,
        `${BASE}v1/qr.webp`,
      ]),
    ).toEqual(["v1/avatar.webp", "v1/qr.webp"]);
  });
});

describe("unsavedUploadPaths", () => {
  const NOW = Date.parse("2026-09-22T12:00:00Z");
  const old = "2026-09-21T11:59:59Z"; // just over 24h before NOW
  const recent = "2026-09-22T11:00:00Z"; // 1h before NOW

  it("selects unreferenced objects older than the grace window", () => {
    expect(
      unsavedUploadPaths(
        "v1",
        [
          { name: "kept.webp", created_at: old },
          { name: "abandoned.webp", created_at: old },
        ],
        ["v1/kept.webp"],
        { nowMs: NOW },
      ),
    ).toEqual(["v1/abandoned.webp"]);
  });

  it("spares uploads still inside the grace window", () => {
    expect(
      unsavedUploadPaths(
        "v1",
        [{ name: "fresh.webp", created_at: recent }],
        [],
        { nowMs: NOW },
      ),
    ).toEqual([]);
  });

  it("treats an object exactly at the grace boundary as abandoned", () => {
    expect(
      unsavedUploadPaths(
        "v1",
        [{ name: "edge.webp", created_at: "2026-09-22T11:00:00Z" }],
        [],
        { nowMs: NOW, graceMs: 60 * 60 * 1000 },
      ),
    ).toEqual(["v1/edge.webp"]);
  });

  it("skips folders and objects without a usable timestamp", () => {
    expect(
      unsavedUploadPaths(
        "v1",
        [
          { name: "sub", created_at: null },
          { name: "no-ts.webp" },
          { name: "bad-ts.webp", created_at: "not a date" },
        ],
        [],
        { nowMs: NOW },
      ),
    ).toEqual([]);
  });

  it("defaults the grace window to 24 hours", () => {
    expect(UNSAVED_UPLOAD_GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
