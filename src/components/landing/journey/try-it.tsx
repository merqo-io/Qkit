"use client";

import { useReducer } from "react";

import { ChapterBoard } from "./chapter-board";
import { ChapterOrder } from "./chapter-order";
import { ChapterQueue } from "./chapter-queue";
import { CHAPTER_STEP } from "../rhythm";
import {
  INITIAL_STATE,
  announcement,
  phaseOf,
  tryItReducer,
} from "./try-it-state";

/**
 * The three chapters share one reducer, so what the visitor does in chapter 1
 * shows up on the board in chapter 2 and on the queue screen and phone in
 * chapter 3. Client state only: no network, no server actions, no database.
 * The page sections wrap this in a Server Component and pass no props.
 */
export function TryIt() {
  const [state, dispatch] = useReducer(tryItReducer, INITIAL_STATE);
  const phase = phaseOf(state);

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement(state)}
      </p>
      <ChapterOrder state={state} dispatch={dispatch} />
      <div className={CHAPTER_STEP}>
        <ChapterBoard state={state} phase={phase} dispatch={dispatch} />
      </div>
      <div className={CHAPTER_STEP}>
        <ChapterQueue phase={phase} />
      </div>
    </>
  );
}
