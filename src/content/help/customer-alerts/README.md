# customer-alerts

## Purpose

The "Customer alerts" user-guide article: what customers see at each order stage and how ready alerts reach them.

## Contents

- `customer-alerts.ts` — exports `article` (`HelpArticle`, category `customer-alerts`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files (alert, push and customer-notify code, the settings form) and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.

## Parent

[help](../README.md)
