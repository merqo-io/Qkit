import { useEffect, useRef, type RefObject } from "react";

/**
 * Lets the dashboard setup checklist link straight to the Payment card, which
 * sits inside the collapsed More settings panel. When the edit page is reached
 * with `#payment`, at mount or later through a client-side navigation
 * (`hashchange`), this opens the panel and scrolls once it has rendered.
 * `setOpen` must be a stable setter so the listener is only bound once.
 */
export function usePaymentDeepLink(
  isEdit: boolean,
  moreOpen: boolean,
  setOpen: (open: boolean) => void,
): RefObject<HTMLDivElement | null> {
  const paymentRef = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const openRef = useRef(moreOpen);

  useEffect(() => {
    openRef.current = moreOpen;
    if (moreOpen && pending.current) {
      pending.current = false;
      paymentRef.current?.scrollIntoView({ block: "start" });
    }
  }, [moreOpen]);

  useEffect(() => {
    if (!isEdit) return;
    const apply = () => {
      if (window.location.hash !== "#payment") return;
      if (openRef.current) {
        paymentRef.current?.scrollIntoView({ block: "start" });
        return;
      }
      pending.current = true;
      setOpen(true);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [isEdit, setOpen]);

  return paymentRef;
}
