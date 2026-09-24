import { normalisePalette, type Mode, type Palette } from "./palette";

/** Light, dark, or whatever the OS says. */
export type Theme = "system" | "light" | "dark";

const DEFAULT_THEME: Theme = "system";

/**
 * Theme lives in localStorage and **only** there (§13.8 #1): IndexedDB is async
 * and so unreadable before first paint. The key keeps its pre-rebrand name —
 * a rename reads as "no theme stored" and flashes every install back to system.
 */
export const THEME_KEY = "hapi-theme";

/**
 * Here beside the theme key because both are read by the pre-paint script
 * below; `lib/skin.ts` owns the rest and imports this, not the reverse, which
 * would drag a `"use client"` module into the server graph. See §6.5.
 */
export const SKIN_KEY = "hapi-skin";

/**
 * And the palette key, for the same reason (§6.6). The `hapi` prefix is by
 * choice, not history: a lone `openhabits-palette` beside `hapi-theme` in
 * devtools reads as an accident.
 */
export const PALETTE_KEY = "hapi-palette";

/**
 * Runs before paint, inlined into <head>; tiny and total-failure-safe. One
 * `try` for all three axes, so a throwing `localStorage` or a malformed palette
 * leaves the document exactly as the prerendered HTML already has it. The two
 * regexes are load-bearing: these values go straight into a style declaration,
 * so a custom-property name and a six-digit hex are all that is accepted.
 * `applyPaletteVars` is this code's runtime twin and must stay identical to it.
 */
export const THEME_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light'){d.dataset.theme=t}var s=localStorage.getItem('${SKIN_KEY}');if(s==='grid'||s==='blocks'){d.dataset.skin=s}var p=localStorage.getItem('${PALETTE_KEY}');if(p){var m=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light',o=JSON.parse(p)[m];for(var k in o){if(/^--[a-z0-9-]+$/.test(k)&&/^#[0-9a-f]{6}$/i.test(o[k])){d.style.setProperty(k,o[k])}}}}catch(e){}`;

/**
 * `data-theme` when set, the OS preference otherwise — what the stylesheet's
 * media query answers, asked in JS because an inline style cannot carry one.
 */
export function resolveMode(): Mode {
  if (typeof document === "undefined") return "light";
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return "dark";
  if (explicit === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredPalette(): Palette | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PALETTE_KEY);
    return raw === null ? null : normalisePalette(JSON.parse(raw));
  } catch {
    // Storage disabled, or a value someone hand-edited into nonsense.
    return null;
  }
}

/**
 * Held in memory, not re-read per paint: `useSyncExternalStore` would loop on a
 * freshly parsed object, and this is the only copy when `localStorage` throws.
 * `undefined` means "not read yet", distinct from a stored `null`.
 */
let current: Palette | null | undefined;

export function currentPalette(): Palette | null {
  if (current === undefined) current = readStoredPalette();
  return current;
}

/**
 * Repaint from the palette in force. Custom properties are cleared first so a
 * removed palette leaves no stale colour; only those, rather than the whole
 * `style` attribute, in case anything else ever writes there.
 */
export function applyPaletteVars(): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  for (const name of Array.from(root.style)) {
    if (name.startsWith("--")) root.style.removeProperty(name);
  }

  const palette = currentPalette();
  if (palette === null) return;

  for (const [token, colour] of Object.entries(palette[resolveMode()])) {
    root.style.setProperty(token, colour);
  }

  syncThemeColor(palette);
}

/** The only way to change palette. Null restores the skin's own colours. */
export function setPalette(palette: Palette | null): void {
  current = palette;

  try {
    if (palette === null) localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, JSON.stringify(palette));
  } catch {
    // Storage disabled. The palette still applies for this session.
  }

  applyPaletteVars();
}

/** Re-read storage and repaint — for a change another tab made. */
export function refreshPalette(): void {
  current = readStoredPalette();
  applyPaletteVars();
}

/**
 * Both `theme-color` metas are rewritten rather than a third appended: the
 * browser honours the first tag whose media matches, so an unmediated one
 * added at the end would never win.
 */
function syncThemeColor(palette: Palette): void {
  const pairs: [string, Mode][] = [
    ["(prefers-color-scheme: light)", "light"],
    ["(prefers-color-scheme: dark)", "dark"],
  ];

  for (const [media, mode] of pairs) {
    const tag = document.querySelector(
      `meta[name="theme-color"][media="${media}"]`,
    );
    tag?.setAttribute("content", palette[mode]["--background"]);
  }
}

function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/** Wrapped: Safari in private mode throws on `localStorage` rather than returning null. */
export function readTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;

  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage disabled. The theme still applies for this session.
  }

  // Which half of the palette applies just changed. Every caller gets this for
  // free, which is why `lib/store.ts` knows nothing about palettes.
  applyPaletteVars();
}
