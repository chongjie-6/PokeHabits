"use client";

/**
 * The React surface for the theme (§13.8 #1). Separate because `lib/theme.ts`
 * is imported by a Server Component for `THEME_SCRIPT`, and `"use client"`
 * there would drag the appearance layer into the client graph for one string.
 * Shaped like `lib/skin.ts`, the three axes being one decision.
 */

import { useSyncExternalStore } from "react";
import { THEME_KEY, applyTheme, readTheme, type Theme } from "./theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // `storage` fires in *other* tabs, which would otherwise sit on the old
  // theme until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    applyTheme(readTheme());
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Reactive `readTheme()`, reporting `system` through hydration like `useSkin`
 * and `usePalette` — so **every consumer sits inside a subtree gated on
 * `store.hydrated`**. Token-level differences need CSS, not this hook.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
}

/** The only way a component should change theme. */
export function changeTheme(theme: Theme): void {
  applyTheme(theme);
  for (const listener of listeners) listener();
}
