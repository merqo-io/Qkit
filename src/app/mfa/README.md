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
- `mfa-form.tsx` — client form: enrol an authenticator (QR plus manual key) or
  verify a 6-digit code with `challengeAndVerify`, then enter `/admin`.
- `mfa-form.dom.test.tsx` — verify, wrong code, enrol-then-verify, bad input.

## Connectivity

Needs TOTP enrolment and verification enabled in Supabase Auth.
