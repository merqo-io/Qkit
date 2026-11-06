import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { BackButton } from "@merqo/ui";
import { ProfileForm } from "./profile-form";
import { PageHeader } from "@merqo/ui";

export const revalidate = 0;

export default async function ProfilePage() {
  // Same primed entitlement cache as the layout — avoids a second vendor read.
  const { user, vendor } = await requireEntitledVendor();

  // display_name and avatar_url are arbitrary JSON on the auth user — read
  // defensively. avatar_url is the vendor's optional custom profile icon.
  const raw = user.user_metadata?.display_name;
  const displayName = typeof raw === "string" ? raw : "";
  const rawAvatar = user.user_metadata?.avatar_url;
  const avatarUrl = typeof rawAvatar === "string" ? rawAvatar : null;

  return (
    <div className="mx-auto max-w-lg space-y-8 md:max-w-4xl">
      <PageHeader
        eyebrow="Your account"
        title="Profile"
        className="mb-8"
        back={
          <div className="-ml-2.5">
            <BackButton href="/dashboard" label="Back to board" />
          </div>
        }
      >
        Your stall name, profile icon, how we address you, and your sign-in
        password. Each section saves on its own.
      </PageHeader>

      <ProfileForm
        stallName={vendor.name}
        displayName={displayName}
        email={user.email ?? ""}
        vendorId={user.id}
        avatarUrl={avatarUrl}
        socialLinks={vendor.social_links}
      />
    </div>
  );
}
