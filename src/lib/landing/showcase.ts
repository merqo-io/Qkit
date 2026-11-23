import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types";

import { SHOWCASE_TAG } from "./showcase-tag";

/** One hour: the list changes only when an admin flips a toggle, which also busts the tag. */
const SHOWCASE_REVALIDATE_SECONDS = 3600;

export type ShowcaseVendor = { name: string; logoUrl: string | null };

const rowSchema = z.object({
  name: z.string().trim().min(1),
  logo_url: z.string().nullable(),
});

/**
 * Keeps the rows that parse and drops the rest, so one malformed row can never
 * blank the whole landing section.
 */
export function parseShowcaseRows(data: unknown): ShowcaseVendor[] {
  if (!Array.isArray(data)) return [];
  const vendors: ShowcaseVendor[] = [];
  for (const row of data) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) {
      vendors.push({ name: parsed.data.name, logoUrl: parsed.data.logo_url });
    }
  }
  return vendors;
}

async function fetchShowcaseVendors(): Promise<ShowcaseVendor[]> {
  try {
    // A plain publishable-key client: it reads no cookies, so the landing page
    // stays cacheable and the RPC always runs as anon.
    const supabase = createClient<Database, "qkit">(
      publicEnv.supabaseUrl,
      publicEnv.supabasePublishableKey,
      {
        db: { schema: "qkit" },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase.rpc("get_showcase_vendors");
    if (error) {
      console.error("get_showcase_vendors failed", error.message);
      return [];
    }
    return parseShowcaseRows(data);
  } catch (err) {
    console.error("get_showcase_vendors failed", err);
    return [];
  }
}

/** Vendors an admin has switched on for the landing page. Never throws. */
export const getShowcaseVendors = unstable_cache(
  fetchShowcaseVendors,
  [SHOWCASE_TAG],
  { revalidate: SHOWCASE_REVALIDATE_SECONDS, tags: [SHOWCASE_TAG] },
);
