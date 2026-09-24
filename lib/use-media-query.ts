"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Returns false on the server and through hydration, so every consumer must sit
 * inside a subtree that only renders once the store has hydrated.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const WIDE = "(min-width: 640px)";

/**
 * "Is this a phone". The pointer half is the honest signal and survives
 * rotation, where a width-only test would swap the form under the user
 * mid-edit. The width half is there because device emulation reports a fine
 * pointer, and a window this narrow wants the sheet anyway; being a union, it
 * only ever adds one.
 */
export const MOBILE = "(pointer: coarse), (max-width: 639px)";
