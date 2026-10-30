import { NextResponse } from "next/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bearerOk,
  findAuthUserByEmail,
  listAllAuthUsers,
} from "@/lib/merqo/auth";
import { latestActivePassByVendor } from "@/lib/admin/stats";
import { computeVendorActivity } from "@/lib/merqo/vendor-activity";
import type { Plan } from "@/lib/types";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { summarizeIncidents } from "@/lib/ops-events";

export const revalidate = 0;

const querySchema = z.object({ email: z.email() });

async function readActivityData(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  vendorId: string,
) {
  // merqo.support_messages' SELECT policy gates on merqo.merqo_team
  // membership, not qkit.admins/service-role scope alone — reuse the same
  // service-client-cast-to-the-merqo-schema pattern admin/page.tsx already
  // establishes rather than adding a second Supabase client.
  const merqoClient =
    supabase as unknown as SupabaseClient<MerqoSupportMessagesSchema>;

  const [booths, licenses, messages] = await Promise.all([
    readAllRows((from, to) =>
      supabase
        .from("booths")
        .select("id, vendor_id, created_at, is_active")
        .eq("vendor_id", vendorId)
        .order("id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabase
        .from("licenses")
        .select("vendor_id, valid_from, expires_at")
        .eq("vendor_id", vendorId)
        .order("id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      merqoClient
        .schema("merqo")
        .from("support_messages")
        .select("id, status")
        .eq("kit_slug", "qkit")
        .eq("user_id", vendorId)
        .eq("status", "open")
        .order("id")
        .range(from, to),
    ),
  ]);
  const boothIds = booths.map((b) => b.id);
  const orders = [];
  for (let offset = 0; offset < boothIds.length; offset += 100) {
    orders.push(
      ...(await readAllRows((from, to) =>
        supabase
          .from("orders")
          .select("booth_id, status, total_cents, created_at")
          .in("booth_id", boothIds.slice(offset, offset + 100))
          .order("id")
          .range(from, to),
      )),
    );
  }
  return { booths, licenses, messages, orders };
}

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    email: searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // Defense-in-depth against a leaked bearer secret -- the secret itself is
  // the real gate, this just blunts enumeration/DoS once compromised.
  const allowed = await rateLimit(
    `merqo-vendor-activity:${clientIp(request.headers)}`,
    30,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const usersRes = await listAllAuthUsers(supabase, "merqo vendor-activity");
  if (usersRes.error) {
    console.error("merqo vendor-activity: read failed", usersRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const user = findAuthUserByEmail(
    (usersRes.data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
    })),
    parsed.data.email,
  );
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const vendorRes = await supabase
    .from("vendors")
    .select("id, plan, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (vendorRes.error) {
    console.error(
      "merqo vendor-activity: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendor = vendorRes.data;
  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [{ booths, licenses, messages, orders }, incidents] =
      await Promise.all([
        readActivityData(supabase, vendor.id),
        summarizeIncidents(supabase, vendor.id),
      ]);

    const nowMs = Date.now();
    const passExpiresAt =
      latestActivePassByVendor(licenses, nowMs).get(vendor.id) ?? null;

    const payload = computeVendorActivity(
      vendor as { id: string; plan: Plan; created_at: string },
      {
        booths,
        orders,
        passExpiresAt,
        hasOpenMessage: messages.length > 0,
      },
      nowMs,
    );

    return NextResponse.json(
      incidents ? { ...payload, ...incidents } : payload,
    );
  } catch (error) {
    console.error("merqo vendor-activity: read failed", error);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
}
