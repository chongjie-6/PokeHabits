"use client";

import { useCallback, useSyncExternalStore } from "react";
import { todayKey } from "./dates";
import type { DayKey } from "./types";

/**
 * The current civil day as external state, which the clock genuinely is — so
 * hydration gets the server snapshot and then switches over. Subscribing also
 * rolls the app over at midnight, for the phone left on a bedside table.
 */

const TICK_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const onVisible = () => {
    if (!document.hidden) onChange();
  };

  const timer = setInterval(onChange, TICK_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onChange);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onChange);
  };
}

/** Null on the server and through hydration; a DayKey from then on. */
export function useToday(dayStartHour: number): DayKey | null {
  // A DayKey is a string, so `Object.is` settles on value equality and a fresh
  // call per snapshot does not loop.
  const getSnapshot = useCallback(() => todayKey(dayStartHour), [dayStartHour]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
