import { handleAuthConfirm } from "@merqo/ui/auth";
import { createServerClient } from "@/lib/supabase/server";

export function POST(request: Request) {
  return handleAuthConfirm(request, {
    createClient: createServerClient,
    defaultNext: "/dashboard",
    recovery: { path: "/reset-password" },
  });
}
