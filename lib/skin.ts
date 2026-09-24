"use client";

/**
 * The visual skin — which design, independent of light or dark. See DESIGN.md
 * §6.5. **Device-local, deliberately**: it never enters the synced blob, so a
 * look chosen on a phone cannot repaint a laptop (§13.8 #1), at the cost of a
 * skin not being in a backup. **The absent attribute is `classic`**, mirroring
 * `data-theme`, so prerendered HTML carries no skin attribute at all.
 * `SKIN_KEY` lives in `lib/theme.ts`, beside the key the same script reads.
 */

import { useSyncExternalStore } from "react";
import { SKIN_KEY } from "./theme";

export type Skin = "classic" | "grid" | "blocks";

export const SKINS: { value: Skin; label: string; hint: string }[] = [
  {
    value: "classic",
    label: "Classic",
    hint: "Cards, soft edges, one column.",
  },
  { value: "grid", label: "Grid", hint: "Your year up top, dense rows below." },
  { value: "blocks", label: "Blocks", hint: "Hard edges and big tiles." },
];

export { SKIN_KEY };

const DEFAULT_SKIN: Skin = "classic";

function isSkin(value: unknown): value is Skin {
  return value === "classic" || value === "grid" || value === "blocks";
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in *other* tabs, which would otherwise sit on a stale
  // layout until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SKIN_KEY) return;
    applyAttribute(readSkin());
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Wrapped: Safari in private mode throws on `localStorage` rather than returning null. */
export function readSkin(): Skin {
  try {
    const stored = window.localStorage.getItem(SKIN_KEY);
    return isSkin(stored) ? stored : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

function applyAttribute(skin: Skin): void {
  if (skin === DEFAULT_SKIN) delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
}

/** The only way to change skin: attribute, storage mirror, and a notification. */
export function applySkin(skin: Skin): void {
  if (typeof document === "undefined") return;

  applyAttribute(skin);

  try {
    localStorage.setItem(SKIN_KEY, skin);
  } catch {
    // Storage disabled. The skin still applies for this session.
  }

  emit();
}

/**
 * Reactive `readSkin()`, reporting `classic` through hydration — so **every
 * consumer sits inside a subtree gated on hydration**. Token-level differences
 * need CSS instead; reach for this only where the markup changes shape, and
 * never in `BottomNav`, which renders un-gated.
 */
export function useSkin(): Skin {
  return useSyncExternalStore(subscribe, readSkin, () => DEFAULT_SKIN);
}
