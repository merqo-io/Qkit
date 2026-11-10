# payments

## Purpose

The "Payments" user-guide article: handle payment claims, confirm that you were paid and settle walk-up orders.

## Contents

- `payments.ts` — exports `article` (`HelpArticle`, category `payments`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.
- Payment behaviour itself belongs to paykit; the article only describes what the vendor sees.

## Parent

[help](../README.md)
