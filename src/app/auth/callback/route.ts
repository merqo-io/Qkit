import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { authCallbackQuerySchema, redirectPathSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const query = authCallbackQuerySchema.safeParse({
    code: searchParams.get("code") ?? undefined,
  });

  // Where to land after the session is established. Both OAuth sign-in and the
  // password-recovery link route through here; recovery passes ?next=/reset-password.
  // Only a same-origin relative path is accepted, so the param can't be an open
  // redirect; anything else goes to the dashboard.
  const next = redirectPathSchema.safeParse(searchParams.get("next"));
  const safeNext = next.success ? next.data : "/dashboard";

  if (!query.success) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(query.data.code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  return NextResponse.redirect(`${origin}${safeNext}`);
}
