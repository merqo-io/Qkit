"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@merqo/ui/primitives";
import { submitHelpFeedback } from "./feedback-actions";
import {
  HELP_COMMENT_MAX,
  type HelpFeedbackInput,
  type HelpFeedbackResult,
  type HelpVote,
} from "@/lib/help/feedback";

type Props = {
  slug: string;
  initialVote: HelpVote | null;
  submit?: (input: HelpFeedbackInput) => Promise<HelpFeedbackResult>;
};

/**
 * "Was this helpful?" control at the end of a help article. A No vote reveals
 * an optional comment box. The vendor can change their vote at any time.
 */
export function ArticleFeedback({
  slug,
  initialVote,
  submit = submitHelpFeedback,
}: Props) {
  const [saved, setSaved] = useState<boolean | null>(
    initialVote ? initialVote.helpful : null,
  );
  const [composing, setComposing] = useState(false);
  const [comment, setComment] = useState(initialVote?.comment ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function send(helpful: boolean, text?: string) {
    setError(false);
    startTransition(async () => {
      const result = await submit({
        slug,
        helpful,
        ...(helpful ? {} : { comment: text }),
      });
      if (result.ok) {
        setSaved(helpful);
        setComposing(false);
      } else {
        setError(true);
      }
    });
  }

  function choose(helpful: boolean) {
    if (helpful) {
      setComment("");
      send(true);
      return;
    }
    setError(false);
    setComposing(true);
  }

  const buttonClass = "min-h-11 min-w-24 flex-1 sm:flex-none";

  return (
    <section
      aria-labelledby="help-feedback-title"
      className="space-y-3 rounded-xl border border-border bg-card px-4 py-4"
    >
      <h2 id="help-feedback-title" className="text-sm font-semibold">
        Was this helpful?
      </h2>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={saved === true ? "default" : "outline"}
          aria-pressed={saved === true}
          disabled={pending}
          onClick={() => choose(true)}
          className={buttonClass}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant={saved === false ? "default" : "outline"}
          aria-pressed={saved === false}
          disabled={pending}
          onClick={() => choose(false)}
          className={buttonClass}
        >
          No
        </Button>
      </div>

      {composing && (
        <div className="space-y-2">
          <label htmlFor="help-feedback-comment" className="text-sm">
            What was missing?
          </label>
          <Textarea
            id="help-feedback-comment"
            value={comment}
            maxLength={HELP_COMMENT_MAX}
            rows={3}
            disabled={pending}
            onChange={(e) => setComment(e.target.value)}
            className="text-base"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {comment.length}/{HELP_COMMENT_MAX}
            </span>
            <Button
              type="button"
              disabled={pending}
              onClick={() => send(false, comment)}
              className="min-h-11 min-w-24"
            >
              Send
            </Button>
          </div>
        </div>
      )}

      {saved !== null && !composing && !pending && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          Thanks for the feedback.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Could not save your feedback. Try again.
        </p>
      )}
    </section>
  );
}
