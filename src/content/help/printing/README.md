# printing

## Purpose

The "Printing" user-guide article: turn on per-item labels and see what the board shows when a label fails.

## Contents

- `printing.ts` — exports `article` (`HelpArticle`, category `printing`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files (printing section, printer status, the print-status route and the printkit client) and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked.
- Print logic belongs to printkit; the article only describes what the vendor sees.

## Parent

[help](../README.md)
