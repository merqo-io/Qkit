import { useEffect, useRef, useState } from "react";
import type { PendingUndo } from "./order-card-parts";

/**
 * A just-tapped advance sits in `pendingUndo` until the undo window closes
 * (timer in undoTimerRef) or the vendor taps Undo. Cleared on unmount too, so a
 * card that scrolls out of view (or the completed order finally leaving the
 * board once the window ends) never fires a late setState.
 */
export function useUndoWindow(
  orderId: string,
  undoMs: number,
  onUndoWindowChange?: (orderId: string, active: boolean) => void,
) {
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  function stopTimer() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  // A dismissed/expired undo window just clears local state — the DB write
  // it's undoing (or not) already happened; there's nothing left to do here.
  function dismissUndo() {
    setPendingUndo(null);
    onUndoWindowChange?.(orderId, false);
  }

  function openUndoWindow(pending: PendingUndo) {
    setPendingUndo(pending);
    onUndoWindowChange?.(orderId, true);
    stopTimer();
    undoTimerRef.current = setTimeout(dismissUndo, undoMs);
  }

  return { pendingUndo, setPendingUndo, openUndoWindow, stopTimer };
}
