"use client";

import { useCallback, useEffect } from "react";

const LEAVE_MESSAGE =
  "You have changes that are not saved. Leave without saving?";

/** A plain left click on a link to another page of this site. */
function internalLinkOf(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return null;
  const link =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target === "_blank" || link.hasAttribute("download")) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const samePage =
    url.pathname === window.location.pathname &&
    url.search === window.location.search;
  return samePage ? null : link;
}

/**
 * Asks before a form's unsaved changes are thrown away. While `dirty`:
 *
 * - closing the tab, reloading or leaving the site raises the browser's own
 *   "leave site?" prompt;
 * - a click on a link to another page of the app asks first, and stays put on
 *   "Cancel". The App Router has no navigation blocker, so the click is caught
 *   on the document before the link sees it.
 *
 * The returned function asks the same question for a button that navigates in
 * code (a form's own Cancel): `if (confirmLeave()) router.push(...)`.
 *
 * Not covered: the browser's Back button, which the App Router gives no way to
 * hold. Navigation the form does itself after a save is never asked about.
 */
export function useUnsavedChanges(dirty: boolean): () => boolean {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      if (!internalLinkOf(event)) return;
      if (window.confirm(LEAVE_MESSAGE)) return;
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return useCallback(() => !dirty || window.confirm(LEAVE_MESSAGE), [dirty]);
}
