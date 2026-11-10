# mfa

## Purpose

Second-step sign-in for the qkit admins. `requireAdmin()` redirects any team
session below `aal2` here, so the operator console is never reachable with a
password alone.

## Contents

- `page.tsx` — server page; `requireTeamMember()` only (it lives outside
  `/admin` so the `aal2` gate cannot loop back), forwards an `aal2` session to
  `/admin`, otherwise passes the verified TOTP factor (or stale unverified ones)
  to the form.
- `mfa-form.tsx` — thin adapter over `@merqo/ui`'s `MfaForm`: the shared form
  owns the code field and states; this file supplies the Supabase calls (unenrol
  stale factors, enrol, `challengeAndVerify`, then `router.replace("/admin")`
  and `router.refresh()`) and qkit's error copy. Shared-form differences from
  the old local form: pasted text is reduced to six digits and non-digits are stripped as typed; the input gains a placeholder, `name="code"`, `pattern="[0-9]*"` and `aria-invalid`/`aria-describedby`, and is disabled while pending; the button reads "Verifying" while pending and ignores duplicate taps; the error clears on edit; thrown errors are shown (as the wrong-code copy) instead of escaping; the form stays pending after success until the route changes; the QR renders only for `data:image/` sources.
- `mfa-form.dom.test.tsx` — verify, wrong code, enrol-then-verify, bad and
  pasted input, touch tap, input attributes, rate-limit copy, enrol failure and
  throw, and a verify throw that must not navigate.

## Connectivity

Needs TOTP enrolment and verification enabled in Supabase Auth.
