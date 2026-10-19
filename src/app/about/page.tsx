import Link from "next/link";
import { AboutMerqo } from "@merqo/ui";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/landing/nav";
import { SiteFooter } from "@/components/widgets/site-footer";
import { createServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function AboutPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <Nav authed={Boolean(user)} />
      <AboutMerqo kitName="qkit">
        <Button asChild size="lg">
          <Link href="/#how">See how qkit works</Link>
        </Button>
      </AboutMerqo>
      <SiteFooter showSignIn />
    </div>
  );
}
