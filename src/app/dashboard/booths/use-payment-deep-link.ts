import { useEffect, useRef, type RefObject } from "react";

/**
 * Lets the dashboard setup checklist link straight to the Payment card, which
 * sits inside the collapsed More settings panel. When the edit page is opened
 * with `#payment`, this opens the panel and scrolls once it has rendered.
 * `setOpen` must be a stable setter so the hash is only acted on at mount.
 */
export function usePaymentDeepLink(
  isEdit: boolean,
  moreOpen: boolean,
  setOpen: (open: boolean) => void,
): RefObject<HTMLDivElement | null> {
  const paymentRef = useRef<HTMLDivElement>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (isEdit && window.location.hash === "#payment") {
      pending.current = true;
      setOpen(true);
    }
  }, [isEdit, setOpen]);

  useEffect(() => {
    if (moreOpen && pending.current) {
      pending.current = false;
      paymentRef.current?.scrollIntoView({ block: "start" });
    }
  }, [moreOpen]);

  return paymentRef;
}
