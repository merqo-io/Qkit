# confirm

## Purpose

The own-domain landing page for emailed Supabase links (password reset, signup confirmation, invite, magic link, email change). Email scanners pre-fetch links, so this GET page never consumes the token: it shows a Continue button and only the button's POST verifies.

## Contents

- `page.tsx` - server component. Reads `token_hash`, `type` and `next` from the search params with `readAuthConfirmParams`; renders `AuthConfirmForm` for a valid link and `AuthConfirmInvalid` otherwise. Never calls Supabase. Metadata sets `noindex` and `referrer: no-referrer` so the token in the URL is not leaked.
- `page.test.tsx` - renders the page and checks the form, the invalid state and that Supabase is never called.
- `verify/` - the POST route the Continue button submits to.

## Connectivity

Linked from the merqo-hosted email templates. Reuses the brand lockup shell of the `(auth)` pages and the `@merqo/ui` confirm components.

## Parent

[auth](../README.md)
