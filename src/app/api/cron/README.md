# cron

## Purpose

Vercel Cron endpoints, called by the platform on a schedule declared in `vercel.json` and guarded by `CRON_SECRET`, never by a session.

## Contents

- `proof-storage-drain/` — daily drain of queued payment-screenshot deletions. See its own README.

## Parent

[api](../README.md)
