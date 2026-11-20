"use server";

import type { SupportMessageInput } from "@/lib/schemas";
import { submitSupportMessage } from "@/app/actions/support";
import type { ActionResult } from "@/lib/action-result";

/**
 * Adapter for @merqo/ui's LandingAccountNav, whose help form sends `message`
 * where qkit's support action names the field `body`. The result is returned
 * as is: the nav throws a `{ success: false }` result itself.
 */
export async function submitLandingSupport(input: {
  category: SupportMessageInput["category"];
  message: string;
}): Promise<ActionResult> {
  return submitSupportMessage({
    category: input.category,
    body: input.message,
  });
}
