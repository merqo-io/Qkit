"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import {
  Button,
  cn,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@merqo/ui/primitives";

import { submitFeedback } from "@/app/actions/feedback";

interface Props {
  source: "customer" | "vendor";
  boothId?: string;
  orderNumber?: string;
  // The order's access token — sent with customer feedback so the server can
  // verify the reviewer actually placed this order.
  token?: string;
  prompt?: string;
  // "stars" = 1–5 (customer order rating); "nps" = 0–10 recommend score
  // (vendor → qkit loyalty). Defaults to stars.
  metric?: "stars" | "nps";
}

/** Compact rating/NPS + message feedback widget → feedback table. */
export function FeedbackForm({
  source,
  boothId,
  orderNumber,
  token,
  prompt,
  metric = "stars",
}: Props) {
  // For stars: 1–5, 0 = unset. For NPS: 0–10, -1 = unset (0 is a valid score).
  const [score, setScore] = useState(metric === "nps" ? -1 : 0);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const hasScore = metric === "nps" ? score >= 0 : score > 0;

  function send() {
    if (!hasScore && !message.trim()) {
      toast.error(
        metric === "nps"
          ? "Pick a score or leave a note"
          : "Add a rating or a message",
      );
      return;
    }
    start(async () => {
      try {
        const res = await submitFeedback({
          source,
          boothId,
          orderNumber,
          token,
          rating: metric === "stars" && score > 0 ? score : undefined,
          nps: metric === "nps" && score >= 0 ? score : undefined,
          message: message.trim() || undefined,
        });
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        setSent(true);
      } catch {
        toast.error("Could not send feedback. Please try again.");
      }
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
        Thanks for the feedback, it helps us improve. 🙏
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">{prompt ?? "How was it?"}</p>
      {metric === "nps" ? (
        <>
          <ToggleGroup
            type="single"
            value={score >= 0 ? String(score) : undefined}
            onValueChange={(v) => v && setScore(Number(v))}
            spacing={1}
            aria-label="Recommend score, 0 to 10"
            className="grid grid-cols-6 sm:grid-cols-11"
          >
            {Array.from({ length: 11 }, (_, n) => (
              <ToggleGroupItem
                key={n}
                value={String(n)}
                aria-label={`${n}`}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border border-border text-sm font-semibold tabular-nums text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5",
                  "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                )}
              >
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </>
      ) : (
        <ToggleGroup
          type="single"
          value={score > 0 ? String(score) : undefined}
          onValueChange={(v) => v && setScore(Number(v))}
          spacing={1}
          aria-label="Rating"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className="size-11 rounded-lg p-0 hover:bg-accent data-[state=on]:bg-transparent"
            >
              <Star
                className={cn(
                  "size-6",
                  n <= score
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40",
                )}
              />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        aria-label={prompt ?? "Your feedback"}
        placeholder="Anything we can improve? (optional)"
        rows={3}
        maxLength={2000}
        className="rounded-lg text-sm"
      />
      <Button
        type="button"
        className="h-11 w-full rounded-xl font-semibold"
        onClick={send}
        disabled={pending}
      >
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </div>
  );
}
