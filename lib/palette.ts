/**
 * Custom palettes — the third appearance axis. See DESIGN.md §6.6. Colour
 * tokens only, with a light and a dark half, so it composes with theme and skin.
 *
 * **It wins by being inline**, which beats every `:root[data-skin=…]` block —
 * so no skin knows palettes exist. **Device-local like skin**, never in the
 * synced blob (§13.8 #1). **Contrast moves to the user**: `deriveSwatches`
 * builds one that passes AA by construction and `audit` re-measures, but
 * neither refuses a bad colour.
 *
 * Pure. Storage and the DOM are `lib/theme.ts`; React is `lib/use-palette.ts`.
 */

import { AA_NON_TEXT, AA_TEXT, contrastRatio } from "./contrast";
import { hexToOklch, oklchToHex } from "./oklch";

export type Mode = "light" | "dark";

/**
 * Every colour token a skin defines, and nothing else. Out on purpose: the six
 * habit accents (a habit's colour is its identity), the `--habit-l-*` band
 * (which tracks the theme), and every shape and type token (the skin's job).
 */
export const PALETTE_TOKENS = [
  "--background",
  "--surface",
  "--surface-2",
  "--border",
  "--foreground",
  "--muted",
  "--accent",
  "--accent-fg",
  "--accent-2",
  "--accent-2-fg",
  "--ring",
  "--danger",
  "--quote-bg",
  "--quote-fg",
  "--quote-meta",
  "--hm-0",
  "--hm-1",
  "--hm-2",
  "--hm-3",
  "--hm-4",
] as const;

export type PaletteToken = (typeof PALETTE_TOKENS)[number];

/** A full set of colours for one mode. Values are always `#rrggbb`. */
export type Swatches = Record<PaletteToken, string>;

export type Palette = { light: Swatches; dark: Swatches };

export const TOKEN_GROUPS: {
  title: string;
  hint: string;
  tokens: { token: PaletteToken; label: string }[];
}[] = [
  {
    title: "Surfaces",
    hint: "The page, the cards on it, and the lines between them.",
    tokens: [
      { token: "--background", label: "Page" },
      { token: "--surface", label: "Card" },
      { token: "--surface-2", label: "Inset" },
      { token: "--border", label: "Border" },
    ],
  },
  {
    title: "Text",
    hint: "Two roles only. Anything that needs to recede further gets a smaller role, not a third colour.",
    tokens: [
      { token: "--foreground", label: "Body" },
      { token: "--muted", label: "Secondary" },
    ],
  },
  {
    title: "Accent",
    hint: "Buttons, the active tab, the focus ring. The highlight only shows in designs that paint on black.",
    tokens: [
      { token: "--accent", label: "Accent" },
      { token: "--accent-fg", label: "On accent" },
      { token: "--accent-2", label: "Highlight" },
      { token: "--accent-2-fg", label: "On highlight" },
      { token: "--ring", label: "Focus ring" },
      { token: "--danger", label: "Danger" },
    ],
  },
  {
    title: "Quote",
    hint: "The daily quote gets its own surface, so it can be inverted without touching the rest of the page.",
    tokens: [
      { token: "--quote-bg", label: "Background" },
      { token: "--quote-fg", label: "Text" },
      { token: "--quote-meta", label: "Attribution" },
    ],
  },
  {
    title: "Heatmap",
    hint: "Empty, then four levels of done. This is the all-habits ramp; one habit recolours it from its own accent.",
    tokens: [
      { token: "--hm-0", label: "Empty" },
      { token: "--hm-1", label: "Level 1" },
      { token: "--hm-2", label: "Level 2" },
      { token: "--hm-3", label: "Level 3" },
      { token: "--hm-4", label: "Level 4" },
    ],
  },
];

export function isPaletteHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
}

/**
 * Strict on purpose — every token, every value a lowercase hex. A partial
 * palette would inherit the rest from the active skin, so the same saved
 * colours would render differently depending on a setting it has overridden.
 */
export function normalisePalette(value: unknown): Palette | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  const modes: Partial<Palette> = {};
  for (const mode of ["light", "dark"] as const) {
    const raw = candidate[mode];
    if (typeof raw !== "object" || raw === null) return null;
    const source = raw as Record<string, unknown>;

    const swatches = {} as Swatches;
    for (const token of PALETTE_TOKENS) {
      const value = source[token];
      const colour = typeof value === "string" ? value.toLowerCase() : null;
      if (!isPaletteHex(colour)) return null;
      swatches[token] = colour;
    }
    modes[mode] = swatches;
  }

  return { light: modes.light as Swatches, dark: modes.dark as Swatches };
}

/**
 * The lightness that puts `hue`/`chroma` at `target` contrast against a colour.
 * Binary search because there is nothing to invert: luminance is non-linear in
 * all three axes and chroma is gamut-clipped on the way out. An unreachable
 * target returns the extreme rather than throwing; `audit` reports it.
 */
function fitLightness(
  hue: number,
  chroma: number,
  against: string,
  target: number,
  direction: "darker" | "lighter",
): number {
  let lo = 0;
  let hi = 1;

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const ratio =
      contrastRatio(oklchToHex({ l: mid, c: chroma, h: hue }), against) ?? 1;
    const enough = ratio >= target;
    // Converge on the boundary from whichever side passes for this direction.
    if (direction === "darker") {
      if (enough) lo = mid;
      else hi = mid;
    } else if (enough) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return direction === "darker" ? lo : hi;
}

/** A hair over the bar, so rounding to one decimal cannot show a failure. */
const TEXT_TARGET = AA_TEXT + 0.1;
const NON_TEXT_TARGET = AA_NON_TEXT + 0.2;

/** Lightness of the fixed neutrals, and the most chroma each will borrow. */
const NEUTRALS = {
  light: {
    background: { l: 0.985, c: 0.006 },
    surface: { l: 0.997, c: 0.004 },
    inset: { l: 0.958, c: 0.01 },
    border: { l: 0.88, c: 0.014 },
    foreground: { l: 0.205, c: 0.014 },
    empty: { l: 0.945, c: 0.01 },
  },
  dark: {
    background: { l: 0.175, c: 0.012 },
    surface: { l: 0.215, c: 0.016 },
    inset: { l: 0.255, c: 0.02 },
    border: { l: 0.315, c: 0.02 },
    foreground: { l: 0.93, c: 0.01 },
    empty: { l: 0.215, c: 0.014 },
  },
} as const;

/** Where the heatmap's palest step sits before it walks toward the accent. */
const RAMP_START = { light: 0.87, dark: 0.33 } as const;

/** Red-orange, held fixed: danger should not follow the seed hue. */
const DANGER_HUE = 27;
const DANGER_CHROMA = 0.19;

/**
 * A full palette for one mode from one seed. Lightness is fixed for neutrals
 * and *solved* wherever text sits, so any hue clears AA; chroma is the seed's,
 * scaled hard for neutrals. `oklchToHex` handles out-of-gamut by reducing it.
 */
export function deriveSwatches(seed: string, mode: Mode): Swatches {
  const base = hexToOklch(seed);
  const hue = base?.h ?? 0;
  const chroma = base?.c ?? 0;
  // A near-grey seed should give near-grey neutrals rather than a fixed tint.
  const tint = Math.min(1, chroma / 0.15);

  const neutral = NEUTRALS[mode];
  const hex = (l: number, c: number) => oklchToHex({ l, c, h: hue });

  const background = hex(neutral.background.l, neutral.background.c * tint);
  const surface = hex(neutral.surface.l, neutral.surface.c * tint);
  const inset = hex(neutral.inset.l, neutral.inset.c * tint);
  const border = hex(neutral.border.l, neutral.border.c * tint);
  const foreground = hex(neutral.foreground.l, neutral.foreground.c * tint);
  const empty = hex(neutral.empty.l, neutral.empty.c * tint);

  // Away from the page: darker on a light ground, lighter on a dark one.
  const away = mode === "light" ? "darker" : "lighter";

  const mutedChroma = 0.012 * tint;
  // The inset is the binding constraint for secondary text in either mode.
  const muted = hex(
    fitLightness(hue, mutedChroma, inset, TEXT_TARGET, away),
    mutedChroma,
  );

  // Solved against its own label: an accent is a filled button first.
  const accentFg =
    mode === "light" ? "#ffffff" : hex(0.18, Math.min(chroma, 0.04));
  const accent = hex(
    fitLightness(hue, chroma, accentFg, TEXT_TARGET, away),
    chroma,
  );
  const ring = hex(
    fitLightness(hue, chroma, background, NON_TEXT_TARGET, away),
    chroma,
  );
  const danger = oklchToHex({
    l: fitLightness(DANGER_HUE, DANGER_CHROMA, surface, TEXT_TARGET, away),
    c: DANGER_CHROMA,
    h: DANGER_HUE,
  });

  const accentL = hexToOklch(accent)?.l ?? 0.5;
  const start = RAMP_START[mode];
  const ramp = [0, 1, 2, 3].map((step) =>
    hex(start + (accentL - start) * (step / 3), chroma),
  );

  return {
    "--background": background,
    "--surface": surface,
    "--surface-2": inset,
    "--border": border,
    "--foreground": foreground,
    "--muted": muted,
    "--accent": accent,
    "--accent-fg": accentFg,
    // One accent twice: the second exists for `blocks`, which paints on black.
    "--accent-2": accent,
    "--accent-2-fg": accentFg,
    "--ring": ring,
    "--danger": danger,
    "--quote-bg": surface,
    "--quote-fg": foreground,
    "--quote-meta": muted,
    "--hm-0": empty,
    "--hm-1": ramp[0],
    "--hm-2": ramp[1],
    "--hm-3": ramp[2],
    "--hm-4": ramp[3],
  };
}

export function derivePalette(seed: string): Palette {
  return {
    light: deriveSwatches(seed, "light"),
    dark: deriveSwatches(seed, "dark"),
  };
}

/** Seeds, not palettes: each is run through `derivePalette` on selection. */
export const PRESETS: { id: string; label: string; seed: string }[] = [
  { id: "forest", label: "Forest", seed: "#216e39" },
  { id: "indigo", label: "Indigo", seed: "#3b4cca" },
  { id: "ember", label: "Ember", seed: "#c2410c" },
  { id: "orchid", label: "Orchid", seed: "#6741d9" },
  { id: "ocean", label: "Ocean", seed: "#0c8599" },
  { id: "graphite", label: "Graphite", seed: "#4b5563" },
];

/**
 * The pairings a real screen puts together, not every combination — a wall of
 * green ticks teaches the user to stop reading the panel. `kind: "visible"` is
 * not a WCAG bar but a stated floor, set just under what the shipped skins
 * achieve, to catch the degenerate case: a step lost in the one below it.
 */
export const CONTRAST_PAIRS: {
  label: string;
  fg: PaletteToken;
  bg: PaletteToken;
  min: number;
  kind: "aa" | "visible";
}[] = [
  {
    label: "Body text on the page",
    fg: "--foreground",
    bg: "--background",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Body text on a card",
    fg: "--foreground",
    bg: "--surface",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Secondary text on a card",
    fg: "--muted",
    bg: "--surface",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Secondary text on an inset",
    fg: "--muted",
    bg: "--surface-2",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Label on an accent button",
    fg: "--accent-fg",
    bg: "--accent",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Label on the highlight",
    fg: "--accent-2-fg",
    bg: "--accent-2",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Quote text",
    fg: "--quote-fg",
    bg: "--quote-bg",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Quote attribution",
    fg: "--quote-meta",
    bg: "--quote-bg",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Error text on a card",
    fg: "--danger",
    bg: "--surface",
    min: AA_TEXT,
    kind: "aa",
  },
  {
    label: "Focus ring on the page",
    fg: "--ring",
    bg: "--background",
    min: AA_NON_TEXT,
    kind: "aa",
  },
  {
    label: "Faintest heat on empty",
    fg: "--hm-1",
    bg: "--hm-0",
    min: 1.15,
    kind: "visible",
  },
  {
    label: "Card edge on the page",
    fg: "--border",
    bg: "--background",
    min: 1.2,
    kind: "visible",
  },
];

export type AuditRow = (typeof CONTRAST_PAIRS)[number] & {
  ratio: number;
  passes: boolean;
};

export function audit(swatches: Swatches): AuditRow[] {
  return CONTRAST_PAIRS.map((pair) => {
    const ratio = contrastRatio(swatches[pair.fg], swatches[pair.bg]) ?? 1;
    // Rounded before comparing, so the chip cannot disagree with the number.
    const shown = Math.round(ratio * 10) / 10;
    return { ...pair, ratio, passes: shown >= pair.min };
  });
}
