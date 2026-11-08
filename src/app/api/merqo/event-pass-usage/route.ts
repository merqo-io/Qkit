import { NextResponse } from "next/server";
import { z } from "zod";
import { uuidSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/server";
import { bearerOk } from "@/lib/merqo/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const revalidate = 0;

const querySchema = z
  .object({
    vendor_id: uuidSchema,
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
  })
  .refine((q) => Date.parse(q.starts_at) < Date.parse(q.ends_at));

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense-in-depth against a leaked bearer secret -- the secret itself is
  // the real gate, this just blunts enumeration/DoS once compromised.
  const allowed = await rateLimit(
    `merqo-event-pass-usage:${clientIp(request.headers)}`,
    30,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    vendor_id: searchParams.get("vendor_id") ?? "",
    starts_at: searchParams.get("starts_at") ?? "",
    ends_at: searchParams.get("ends_at") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "vendor_id, starts_at and ends_at required" },
      { status: 400 },
    );
  }
  const { vendor_id, starts_at, ends_at } = parsed.data;

  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("vendor_cups_between", {
    p_vendor_id: vendor_id,
    p_from: starts_at,
    p_to: ends_at,
  });
  if (error) {
    console.error("merqo event-pass-usage: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 500 },
    );
  }

  return NextResponse.json({ vendor_id, starts_at, ends_at, cups: data ?? 0 });
}
