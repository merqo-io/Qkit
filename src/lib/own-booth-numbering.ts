import {
  numberingStateByBooth,
  type NumberingState,
} from "@/lib/daily-order-number";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * numberingStateByBooth through the service client, for the vendor dashboard.
 * It lives apart from daily-order-number so that module stays free of the
 * service-role import. A client bundle cannot pull this in: createServiceClient
 * sits in supabase/server, which imports next/headers. The caller passes booth
 * ids it already read under RLS, so only the vendor's own booths are read; the
 * user-session read of booth_service_starts did not return its rows on prod,
 * which left the board ranking from the latest restart only.
 */
export async function numberingStateForOwnBooths(
  ownBoothIds: string[],
): Promise<NumberingState> {
  return numberingStateByBooth(await createServiceClient(), ownBoothIds);
}
