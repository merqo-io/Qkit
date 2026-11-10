# getting-started

## Purpose

The "Getting started" user-guide article: build a first booth, print the QR and take the first order.

## Contents

- `getting-started.ts` — exports `article` (`HelpArticle`, category `getting-started`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.

## Parent

[help](../README.md)
