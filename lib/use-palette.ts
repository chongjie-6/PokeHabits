"use client";

/**
 * The React and DOM surface for custom palettes (§6.6). `lib/palette.ts` is the
 * pure half and `lib/theme.ts` owns storage; this is what a component touches.
 */

import { useSyncExternalStore } from "react";
import {
  PALETTE_KEY,
  applyPaletteVars,
  currentPalette,
  refreshPalette,
  setPalette,
} from "./theme";
import {
  PALETTE_TOKENS,
  type Mode,
  type Palette,
  type Swatches,
} from "./palette";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // `storage` fires in *other* tabs, which would otherwise sit on stale
  // colours until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PALETTE_KEY) return;
    refreshPalette();
    listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Null when the skin's own colours show, and null through hydration like
 * `useSkin` — so **every consumer sits inside a subtree gated on
 * `store.hydrated`**. Token-level differences need CSS, not this hook.
 */
export function usePalette(): Palette | null {
  return useSyncExternalStore(subscribe, currentPalette, () => null);
}

/** `setPalette`, plus the notification the hook needs. */
export function changePalette(palette: Palette | null): void {
  setPalette(palette);
  emit();
}

/**
 * A palette carries both halves and an inline style cannot hold a media query,
 * so the swap CSS does for free is done by hand here. Mounted once.
 */
export function watchPaletteMode(): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyPaletteVars();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The starting point for "customise what I am looking at", asked of the browser
 * rather than duplicating `globals.css` in TypeScript. The inline properties
 * are lifted and `data-theme` driven to each mode in turn, both restored in a
 * `finally`; it all runs in one task, so no frame catches the document mid-flip.
 */
export function paletteFromSkin(): Palette {
  const root = document.documentElement;
  const inline = root.getAttribute("style");
  const theme = root.dataset.theme;

  // Any palette already applied would otherwise be read straight back out.
  root.removeAttribute("style");

  try {
    return {
      light: readSkinMode(root, "light"),
      dark: readSkinMode(root, "dark"),
    };
  } finally {
    if (theme === undefined) delete root.dataset.theme;
    else root.dataset.theme = theme;

    if (inline === null) root.removeAttribute("style");
    else root.setAttribute("style", inline);
  }
}

/** What a token falls back to when a skin left it un-hexable. */
const LAST_RESORT: Record<Mode, string> = { light: "#ffffff", dark: "#0d1117" };

function readSkinMode(root: HTMLElement, mode: Mode): Swatches {
  root.dataset.theme = mode;
  const computed = window.getComputedStyle(root);
  const raw = (token: string) => computed.getPropertyValue(token);

  // Resolved first so everything else can fall back to it: `grid` sets
  // `--quote-bg: transparent`, and sitting on the page is what that looked like.
  const background = toHex(raw("--background")) ?? LAST_RESORT[mode];

  const swatches = {} as Swatches;
  for (const token of PALETTE_TOKENS) {
    swatches[token] = toHex(raw(token)) ?? background;
  }
  return swatches;
}

/**
 * Custom properties are not parsed as colours, so `getPropertyValue` returns
 * whatever the stylesheet wrote. The common case is already a hex; anything
 * else goes to the one parser guaranteed to agree with the renderer.
 */
function toHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (trimmed === "") return null;
  return resolveColour(trimmed);
}

/** An unlikely colour, so an assignment the parser rejected is recognisable. */
const SENTINEL = "rgb(1, 2, 3)";

function resolveColour(value: string): string | null {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = SENTINEL;
  probe.style.color = value;
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  probe.remove();

  const parts = /^rgba?\(([^)]+)\)$/
    .exec(computed)?.[1]
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts === undefined || parts.length < 3) return null;

  const [r, g, b, a] = parts.map(Number);
  // `transparent` resolves to a transparent black, which as a swatch would
  // read as "the user picked black".
  if (a === 0) return null;
  if (computed === SENTINEL) return null;

  const byte = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
