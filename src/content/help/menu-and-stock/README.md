# menu-and-stock

## Purpose

The "Menu and stock" user-guide article: items, the daily item limit, basket holds and the per-order item limit.

## Contents

- `menu-and-stock.ts` — exports `article` (`HelpArticle`, category `menu-and-stock`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.

## Parent

[help](../README.md)
