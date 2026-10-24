import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getPrinterStatus, printkitConfigured } from "@/lib/printkit/client";

const querySchema = z.object({ booth: z.uuid() });

/**
 * The browser's way to refresh a booth's printer status. It exists so the
 * printkit bearer secret stays on the server: the page could not call
 * printkit directly without shipping that secret to the client.
 *
 * The booth is read through the vendor's own session client, so qkit's RLS
 * decides whose booth it is.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    booth: url.searchParams.get("booth") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown booth" }, { status: 400 });
  }

  const { data: booth } = await supabase
    .from("booths")
    .select("id")
    .eq("id", parsed.data.booth)
    .maybeSingle();

  if (!booth) {
    return NextResponse.json({ error: "Unknown booth" }, { status: 404 });
  }

  const result = await getPrinterStatus(booth.id);
  if (!result.ok) {
    return NextResponse.json({
      printer: null,
      reachable: false,
      configured: printkitConfigured(),
    });
  }

  return NextResponse.json({ ...result.data, reachable: true });
}
