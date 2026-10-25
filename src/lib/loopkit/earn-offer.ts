import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Hand-written mirror of loopkit's `qkit_earn_offer` RPC (loopkit migration
 * 0062); loopkit owns the real types and qkit's generated ones cover only the
 * `qkit` schema.
 */
type LoopkitEarnSchema = {
  loopkit: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      qkit_earn_offer: {
        Args: { p_vendor: string };
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const offerSchema = z.object({
  enabled: z.boolean(),
  program_name: z.string().max(200).optional(),
});

export type EarnOffer = z.infer<typeof offerSchema>;

const CLOSED: EarnOffer = { enabled: false };

/**
 * Whether the vendor offers stamps for qkit orders, and for which program.
 * Fails closed: any error or malformed answer means no offer, so the order
 * page never breaks over it.
 */
export async function getEarnOffer(vendorId: string): Promise<EarnOffer> {
  try {
    const client =
      (await createServiceClient()) as unknown as SupabaseClient<LoopkitEarnSchema>;
    const { data, error } = await client
      .schema("loopkit")
      .rpc("qkit_earn_offer", { p_vendor: vendorId });
    if (error) {
      console.error("getEarnOffer: rpc failed", error.message);
      return CLOSED;
    }
    const parsed = offerSchema.safeParse(data);
    return parsed.success ? parsed.data : CLOSED;
  } catch {
    console.error("getEarnOffer: unavailable");
    return CLOSED;
  }
}
