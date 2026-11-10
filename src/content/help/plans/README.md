# plans

## Purpose

The "Plans" user-guide article: what Free, Starter and Pro include, the optional Event Pass and what "Over plan limit" means.

## Contents

- `plans.ts` — exports `article` (`HelpArticle`, category `plans`): title, summary, `reviewed` date, the `uiLabels` the body quotes, the `covers` source files (`src/lib/plan.ts`, booth access and the plan, booths and stats pages) and the `body` blocks.

## Conventions

- Keep `uiLabels` and `covers` in step with the text; the drift test in `../help-content.test.ts` checks them.
- Bump `reviewed` whenever the article is re-checked, in particular after a plan or limit change in `src/lib/plan.ts`.

## Parent

[help](../README.md)
