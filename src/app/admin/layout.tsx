import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/access";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate every /admin route: non-admins get a 404 from requireAdmin.
  await requireAdmin();

  // Attention count for the bell: open help requests + open purchase requests,
  // the two vendor-raised inboxes an admin acts on. Count-only (head:true) on
  // the indexed status column, run in parallel — negligible per-page cost. RLS
  // (is_admin) already scopes purchase_requests to what an admin may see.
  // merqo.support_messages' SELECT policy gates on merqo.merqo_team
  // membership, not qkit.admins — the RLS-scoped client would silently return
  // zero rows for a qkit admin who isn't also a merqo_team member, so this one
  // query needs the service client instead (mirrors admin/page.tsx).
  const supabase = await createServerClient();
  const merqoClient =
    (await createServiceClient()) as unknown as SupabaseClient<MerqoSupportMessagesSchema>;
  const [openMessages, openRequests] = await Promise.all([
    merqoClient
      .schema("merqo")
      .from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("kit_slug", "qkit")
      .eq("status", "open"),
    supabase
      .from("purchase_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  const attention = (openMessages.count ?? 0) + (openRequests.count ?? 0);

  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-5 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-display text-xl font-semibold tracking-tight">
            <span className="text-primary">Q</span>Kit
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              aria-label={
                attention > 0
                  ? `${attention} items need attention`
                  : "Nothing needs attention"
              }
              className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bell className="size-5" />
              {attention > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-cancelled px-1 text-[10px] font-bold leading-none text-white">
                  {attention > 9 ? "9+" : attention}
                </span>
              )}
            </Link>
            <form action={signOut}>
              <Button
                variant="outline"
                size="sm"
                type="submit"
                className="rounded-lg"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <AdminNav />
      {children}
    </div>
  );
}
