import { FeedbackForm } from "@/components/widgets/feedback-form";
import { PageHeader } from "@merqo/ui";

export const revalidate = 0;

export default function DashboardFeedbackPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader eyebrow="Help shape qkit" title="Feedback" className="mb-6">
        What&apos;s working, what&apos;s missing, what&apos;s broken? We read
        every note.
      </PageHeader>
      <FeedbackForm
        source="vendor"
        metric="nps"
        prompt="How likely are you to recommend qkit to another vendor?"
      />
    </div>
  );
}
