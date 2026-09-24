"use client";

/**
 * One slot of undo, held in memory for a few seconds. See DESIGN.md §7.4.
 * Separate from `lib/store.ts` on purpose: interface state with a timer, not
 * data. **One slot, not a stack** — a way out of the tap you just regretted,
 * where a stack would need every entry to survive the ones beneath it. The
 * offer expires, both for the meaning and for the history it is holding.
 */

import { useSyncExternalStore } from "react";

export type UndoOffer = {
  /** Past tense, addressed to the user: "Run deleted". */
  message: string;
  /** Runs on tap. Must be safe to call once; the offer is cleared first. */
  undo: () => void;
  /** Distinguishes one offer from the next for React, and for the timer. */
  id: number;
};

/** Long enough to notice and reach, short enough not to become furniture. */
export const UNDO_TTL_MS = 8000;

let offer: UndoOffer | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * Returns the offer, mostly so a test can name it. `undo` runs at most once:
 * `dismiss()` goes first, so a double tap cannot restore the same habit twice.
 */
export function offerUndo(message: string, undo: () => void): UndoOffer {
  clearTimer();
  const id = nextId++;
  offer = { message, undo, id };

  timer = setTimeout(() => {
    // Guarded on the id: a second offer replaces the first while its timer is
    // still pending.
    if (offer?.id === id) dismiss();
  }, UNDO_TTL_MS);

  emit();
  return offer;
}

export function dismiss(): void {
  clearTimer();
  if (offer === null) return;
  offer = null;
  emit();
}

/** Run the standing offer and clear it. A no-op when there is none. */
export function runUndo(): void {
  const current = offer;
  if (!current) return;
  dismiss();
  current.undo();
}

export function currentOffer(): UndoOffer | null {
  return offer;
}

/** Reactive `currentOffer()`, and null through hydration is the honest answer. */
export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(subscribe, currentOffer, () => null);
}

/** Test seam: drops the offer and its timer without notifying anyone. */
export function resetUndo(): void {
  clearTimer();
  offer = null;
}
