import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bearerOk,
  findAuthUserByEmail,
  listAllAuthUsers,
} from "@/lib/merqo/auth";
import { resolveVendorStatus } from "@/lib/merqo/vendor-status";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/lib/types";

export const revalidate = 0;

const querySchema = z.object({ email: z.email() });

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
    `merqo-vendor-status:${clientIp(request.headers)}`,
    30,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const usersRes = await listAllAuthUsers(supabase, "merqo vendor-status");
  if (usersRes.error) {
    console.error("merqo vendor-status: read failed", usersRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const user = findAuthUserByEmail(
    usersRes.data?.users ?? [],
    parsed.data.email,
  );
  const vendorsRes = user
    ? await supabase
        .from("vendors")
        .select("id, plan")
        .eq("id", user.id)
        .maybeSingle()
    : null;
  if (vendorsRes?.error) {
    console.error("merqo vendor-status: read failed", vendorsRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const status = resolveVendorStatus(
    parsed.data.email,
    (usersRes.data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
    })),
    (vendorsRes?.data ? [vendorsRes.data] : []) as { id: string; plan: Plan }[],
  );

  return NextResponse.json(status);
}
