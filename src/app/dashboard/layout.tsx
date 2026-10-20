import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { loadEntitlement } from "@/lib/supabase/get-entitlement";
import { isAdmin } from "@/lib/admin/access";
import { requireCurrentLegalAcceptance } from "@/lib/legal-gate";
import { DashboardNav } from "./dashboard-nav";
import { DashboardTour } from "@/components/tour/dashboard-tour";
import { SiteFooter } from "@/components/widgets/site-footer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // loadEntitlement resolves the user, their vendor row, and effective plan in
  // one memoized round-trip — the account menu needs the tier badge, and the
  // vendor row still carries name + tours_seen.
  const { user, vendor, entitlement } = await loadEntitlement();

  if (!user) redirect("/login");

  // Admins have no vendor row and don't use the vendor dashboard.
  if (await isAdmin(user.id)) redirect("/admin");

  // A brand-new user hits /dashboard before onboarding — redirect here, before
  // this layout's header shell renders, instead of letting DashboardPage
  // redirect after the shell already painted (the blank-flash bug).
  if (!vendor) redirect("/onboarding");

  // A vendor whose accepted terms/privacy versions are stale is bounced to
  // the /legal/accept interstitial — done here in the layout (not only in the
  // page-level requireEntitledVendor guard) for the same blank-flash reason as
  // the onboarding redirect above.
  await requireCurrentLegalAcceptance(user.email);

  // Custom profile icon lives on the auth user's metadata (no schema change).
  const rawAvatar = user.user_metadata?.avatar_url;
  const avatarUrl = typeof rawAvatar === "string" ? rawAvatar : null;

  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/*
        @merqo/ui's DashboardNav renders its own <header> (sticky/border/
        padding already baked in) — this used to be qkit's own <header>
        wrapper before DashboardNav composed the shared component, but two
        <header> landmarks nested inside each other double the border/
        padding and are invalid semantics. A plain <div> keeps the one thing
        that <header> wasn't already covering (print:hidden) without adding
        a second landmark.

        `contents` is load-bearing, not decorative: the inner <header> is
        `position: sticky`, which is constrained to its containing block. A
        plain wrapper div's box IS that containing block, and it's exactly
        the header's own height, so the header would never have room to
        stick — it'd scroll away like a static element. `display: contents`
        removes the wrapper's own box from layout, so <header> becomes a
        direct flex item of this component's `min-h-screen flex flex-col`
        container instead — the same containing block it had pre-migration,
        when qkit's own <header> was that flex item directly. `print:hidden`
        still wins under `@media print` since `display: none` on an
        ancestor hides descendants regardless of their own `display` value.
      */}
      <div className="contents print:hidden">
        <DashboardNav
          signOut={signOut}
          vendorName={vendor.name}
          avatarUrl={avatarUrl}
          tier={entitlement.tier}
        />
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-7">
        {children}
      </main>
      <div className="contents print:hidden">
        <SiteFooter />
      </div>
      <DashboardTour toursSeen={vendor.tours_seen} />
    </div>
  );
}
