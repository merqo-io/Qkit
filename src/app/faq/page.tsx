import type { Metadata } from "next";
import { FaqPage } from "@merqo/ui";

import { Nav } from "@/components/landing/nav";
import { SiteFooter } from "@/components/widgets/site-footer";
import { createServerClient } from "@/lib/supabase/server";
import { FAQ_GROUPS, FAQ_INTRO, FAQ_TITLE } from "./faq-content";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "How qkit works at a stall, how payment and cost work, and what it does with your orders and your customers' details.",
};

export default async function FaqRoute() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <Nav authed={Boolean(user)} />
      <main>
        <FaqPage title={FAQ_TITLE} intro={FAQ_INTRO} groups={FAQ_GROUPS} />
      </main>
      <SiteFooter showSignIn />
    </div>
  );
}
