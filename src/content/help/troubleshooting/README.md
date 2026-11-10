# troubleshooting

## Purpose

The "Troubleshooting" user-guide article: quick fixes for sign-up, the live board, payments, booths that will not take orders, QR codes, photos and stats.

## Contents

- `troubleshooting.ts` — exports `article` (`HelpArticle`, category `troubleshooting`): title, summary, `reviewed` date, the `uiLabels` the body quotes (including customer-facing messages), the `covers` source files and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.

## Parent

[help](../README.md)
