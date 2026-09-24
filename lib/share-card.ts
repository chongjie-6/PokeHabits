"use client";

/**
 * The contribution grid as an image the user can keep. See DESIGN.md §4.6. An
 * export, not a social feature: nothing is posted and no account is involved.
 * Drawn rather than screenshotted, because `Heatmap.tsx` renders an interface —
 * cursor, selection rings, phone-sized gutters — rather than a picture.
 */

import { levelColor, type Ramp } from "./colors";
import { formatMonthShort } from "./dates";
import type { DayStat } from "./history";

/**
 * Fixed cells rather than a fixed canvas: a cell is the same size at twenty
 * weeks as at fifty-three, with a floor so a short window is not a strip.
 */
const CELL = 22;
const GAP = 5;
const STEP = CELL + GAP;
const MIN_W = 1080;

const PAD = 72;
/** Title, subtitle, and the month labels that sit just above the first row. */
const GRID_TOP = 260;
/** Baseline of the figures row below the grid, then the footer under that. */
const FIGURES_DROP = 108;
const FOOTER_DROP = 92;

export type ShareCard = {
  title: string;
  /** The line under the title — a cadence, a date range, whatever names it. */
  subtitle: string;
  /** Up to three headline numbers, drawn as a row under the grid. */
  figures: { value: string; label: string }[];
  stats: DayStat[];
  ramp?: Ramp;
};

/**
 * `ctx.fillStyle` parses neither a custom property nor the `color-mix` the
 * ramps are built from, so each token is assigned to a throwaway element and
 * read back through `getComputedStyle` — the only resolver that knows the
 * current theme, skin and palette.
 */
function resolveColors(values: string[]): string[] {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);

  try {
    return values.map((value) => {
      probe.style.color = "";
      probe.style.color = value;
      const computed = getComputedStyle(probe).color;
      // An unparseable value leaves the inherited colour: wrong, never invalid,
      // so the card renders off-colour rather than throwing mid-draw.
      return computed || "#000000";
    });
  } finally {
    probe.remove();
  }
}

type Palette = {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  levels: string[];
};

function palette(ramp: Ramp): Palette {
  const [background, foreground, muted, border, l0, l1, l2, l3, l4] =
    resolveColors([
      "var(--background)",
      "var(--foreground)",
      "var(--muted)",
      "var(--border)",
      levelColor(0, ramp),
      levelColor(1, ramp),
      levelColor(2, ramp),
      levelColor(3, ramp),
      levelColor(4, ramp),
    ]);
  return {
    background,
    foreground,
    muted,
    border,
    levels: [l0, l1, l2, l3, l4],
  };
}

export type Geometry = {
  width: number;
  height: number;
  /** Left edge of the first column, centred when the grid is narrower than the card. */
  left: number;
  gridBottom: number;
};

/**
 * Exported because it is the one part of this file checkable without a canvas,
 * and the part where an off-by-one puts a week over the edge of the image.
 */
export function geometry(weeks: number): Geometry {
  const grid = Math.max(1, weeks) * STEP - GAP;
  const width = Math.max(MIN_W, grid + PAD * 2);
  const gridBottom = GRID_TOP + 7 * STEP - GAP;
  return {
    width,
    height: gridBottom + FIGURES_DROP + FOOTER_DROP + PAD,
    left: Math.round((width - grid) / 2),
    gridBottom,
  };
}

/** A PNG blob, or null where there is no 2D context — the same as "cannot share". */
export async function renderShareCard(card: ShareCard): Promise<Blob | null> {
  const weeks = Math.ceil(card.stats.length / 7);
  const { width, height, left, gridBottom } = geometry(weeks);
  const colors = palette(card.ramp ?? "neutral");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colors.foreground;
  ctx.font = "600 56px system-ui, sans-serif";
  ctx.fillText(truncate(ctx, card.title, width - PAD * 2), PAD, PAD + 56);

  ctx.fillStyle = colors.muted;
  ctx.font = "400 30px system-ui, sans-serif";
  ctx.fillText(truncate(ctx, card.subtitle, width - PAD * 2), PAD, PAD + 110);

  // The same three-column breathing room the on-screen grid uses to keep
  // February off January.
  ctx.font = "400 22px system-ui, sans-serif";
  let previousMonth = "";
  let lastLabelled = -3;
  for (let week = 0; week < weeks; week++) {
    const first = card.stats[week * 7];
    if (!first) continue;
    const month = first.date.slice(0, 7);
    if (month !== previousMonth && week - lastLabelled >= 3) {
      ctx.fillText(
        formatMonthShort(first.date),
        left + week * STEP,
        GRID_TOP - 18,
      );
      lastLabelled = week;
    }
    previousMonth = month;
  }

  card.stats.forEach((stat, index) => {
    const x = left + Math.floor(index / 7) * STEP;
    const y = GRID_TOP + (index % 7) * STEP;

    if (stat.level === "rest") {
      // A rest day is an outline, as on screen: it must not read as a failure.
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5, 5);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = colors.levels[stat.level];
    roundRect(ctx, x, y, CELL, CELL, 5);
    ctx.fill();
  });

  drawFigures(ctx, card.figures, gridBottom + FIGURES_DROP, width, colors);

  ctx.fillStyle = colors.muted;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText("OpenHabits", PAD, height - PAD);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function drawFigures(
  ctx: CanvasRenderingContext2D,
  figures: ShareCard["figures"],
  y: number,
  width: number,
  colors: Palette,
): void {
  if (figures.length === 0) return;
  const column = (width - PAD * 2) / figures.length;

  figures.forEach((figure, i) => {
    const x = PAD + i * column;
    ctx.fillStyle = colors.foreground;
    ctx.font = "600 64px ui-monospace, monospace";
    ctx.fillText(figure.value, x, y);
    ctx.fillStyle = colors.muted;
    ctx.font = "400 24px system-ui, sans-serif";
    ctx.fillText(figure.label.toUpperCase(), x, y + 36);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Trim to fit the measured width, with an ellipsis, using the current font. */
function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/**
 * The share sheet where there is one, a download where there is not. `canShare`
 * is checked with the actual file, since desktop Chrome has `navigator.share`
 * and refuses files, and a cancelled sheet throws `AbortError`.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
): Promise<"shared" | "saved"> {
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return "shared";
      // Anything else falls through to the download, which always works.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return "saved";
}
