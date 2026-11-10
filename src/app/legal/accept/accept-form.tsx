"use client";

import { useState } from "react";
import { TermsAcceptanceCheckbox } from "@merqo/ui";
import { Button } from "@merqo/ui/primitives";

import { acceptLegalTerms } from "./actions";

export function AcceptForm({ next }: { next: string }) {
  const [checked, setChecked] = useState(false);

  return (
    <form action={acceptLegalTerms} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TermsAcceptanceCheckbox checked={checked} onCheckedChange={setChecked} />
      <Button type="submit" className="w-full" disabled={!checked}>
        Continue
      </Button>
    </form>
  );
}
