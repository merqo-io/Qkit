import Link from "next/link";
import { NotFound } from "@merqo/ui";
import { Button } from "@merqo/ui/primitives";

export default function RootNotFound() {
  return (
    <NotFound
      code="404"
      title="Not found"
      description="This page or order doesn't exist. Scan the booth's QR code again to start a fresh order."
      action={
        <Button asChild variant="outline" className="h-11 rounded-xl px-6">
          <Link href="/">Back to start</Link>
        </Button>
      }
    />
  );
}
