# auth

## Purpose

OAuth/magic-link callback handling for Supabase sign-in — the server-side leg that exchanges a one-time auth code for a session and lands the user back in the app.

## Contents

- `callback/` — `GET` route (`route.ts`) that completes the code exchange and redirects.
- `confirm/` — own-domain landing page for emailed links (`page.tsx`) and the `verify/` POST route that verifies the token hash.

## Parent

[app](../README.md)
