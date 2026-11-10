# running-a-service

## Purpose

The "Running a service" user-guide article: work the live board, log walk-up orders, restart the count and show the TV screen.

## Contents

- `running-a-service.ts` — exports `article` (`HelpArticle`, category `running-a-service`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.

## Parent

[help](../README.md)
