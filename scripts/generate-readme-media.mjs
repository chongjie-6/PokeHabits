/**
 * Generates the README banner in docs/media/, light and dark, for the <picture>
 * tag at the top of README.md. The screenshots beside it are real captures —
 * see scripts/screenshots/.
 *
 * The palette is copied from app/globals.css rather than parsed out of it, so a
 * token rename is noticed here rather than silently repainting the banner.
 * Everything is presentation attributes and inline paths: GitHub strips <style>
 * and script from the SVGs it serves and loads no external font, so the type
 * falls back to whatever the reader's system has.
 */

import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../docs/media/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const THEMES = {
  light: {
    bg: "#fbfbf9",
    surface: "#ffffff",
    surface2: "#f3f3f0",
    fg: "#1a1a19",
    muted: "#6f6f68",
    border: "#e5e5df",
    accent: "#216e39",
    ring: "#30a14e",
    hm: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    habit: {
      green: "#2f9e44",
      blue: "#1971c2",
      violet: "#6741d9",
      amber: "#e8590c",
      rose: "#d6336c",
      teal: "#0c8599",
    },
  },
  dark: {
    bg: "#0d1117",
    surface: "#161b22",
    surface2: "#1c2128",
    fg: "#e6edf3",
    muted: "#8b949e",
    border: "#2a313a",
    accent: "#2ea043",
    ring: "#39d353",
    hm: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
    habit: {
      green: "#4ade80",
      blue: "#60a5fa",
      violet: "#a78bfa",
      amber: "#fbbf24",
      rose: "#fb7185",
      teal: "#2dd4bf",
    },
  },
};

const SANS =
  "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(
  x,
  y,
  s,
  {
    size = 12,
    fill,
    weight = 400,
    family = SANS,
    anchor = "start",
    spacing,
    opacity,
  } = {},
) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${family}"`,
    `font-size="${size}"`,
    `fill="${fill}"`,
    `font-weight="${weight}"`,
    anchor !== "start" ? `text-anchor="${anchor}"` : "",
    spacing ? `letter-spacing="${spacing}"` : "",
    opacity !== undefined ? `opacity="${opacity}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<text ${attrs}>${esc(s)}</text>`;
}

const rect = (
  x,
  y,
  w,
  h,
  { fill = "none", rx = 0, stroke, sw = 1, opacity } = {},
) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"` +
  (stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : "") +
  (opacity !== undefined ? ` opacity="${opacity}"` : "") +
  `/>`;

/** Seeded so a regenerate produces a byte-identical file. */
function rng(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** A year of plausible activity: sparse early, denser lately, quieter weekends. */
function yearLevels(weeks = 53) {
  const r = rng(20260906);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const ramp = 0.3 + (w / weeks) * 0.8;
    const col = [];
    for (let d = 0; d < 7; d++) {
      const weekend = d === 5 || d === 6 ? 0.55 : 1;
      const v = r() * ramp * weekend;
      col.push(v < 0.12 ? 0 : v < 0.3 ? 1 : v < 0.5 ? 2 : v < 0.72 ? 3 : 4);
    }
    out.push(col);
  }
  // A fortnight off, because a real year has one.
  for (let w = 18; w < 20; w++) out[w] = [0, 0, 0, 0, 0, 0, 0];
  return out;
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">\n${body}\n</svg>\n`;

/* ---------------------------------------------------------------- banner --- */

function banner(t) {
  const W = 1200,
    H = 440;
  const cell = 13,
    gap = 4,
    step = cell + gap;
  const weeks = yearLevels(53);
  const gridW = weeks.length * step - gap;
  const gx = Math.round((W - gridW) / 2),
    gy = 250;

  const cells = weeks
    .flatMap((col, w) =>
      col.map((lvl, d) =>
        rect(gx + w * step, gy + d * step, cell, cell, {
          fill: t.hm[lvl],
          rx: 3,
          stroke: lvl === 0 ? t.border : undefined,
        }),
      ),
    )
    .join("");

  const monthLabels = [
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
  ]
    .map((m, i) =>
      text(gx + Math.round(i * (gridW / 12)) + 1, gy - 12, m, {
        size: 11,
        fill: t.muted,
        family: MONO,
      }),
    )
    .join("");

  const legendX = gx + gridW - 118;
  const legendY = gy + 7 * step + 18;
  const legend =
    text(legendX - 8, legendY + 9, "Less", {
      size: 11,
      fill: t.muted,
      anchor: "end",
    }) +
    t.hm
      .map((c, i) =>
        rect(legendX + i * 16, legendY, 11, 11, {
          fill: c,
          rx: 3,
          stroke: i === 0 ? t.border : undefined,
        }),
      )
      .join("") +
    text(legendX + 5 * 16 + 4, legendY + 9, "More", {
      size: 11,
      fill: t.muted,
    });

  let px = gx;
  const pills = [
    "Local-first",
    "Works offline",
    "No account needed",
    "MIT licensed",
  ]
    .map((p) => {
      const w = p.length * 7.1 + 28;
      const el =
        rect(px, 186, w, 30, { fill: t.surface, rx: 15, stroke: t.border }) +
        text(px + 14, 205, p, { size: 12.5, fill: t.muted, weight: 500 });
      px += w + 10;
      return el;
    })
    .join("");

  return svg(
    W,
    H,
    [
      rect(0, 0, W, H, { fill: t.bg }),
      rect(gx, 92, 3, 46, { fill: t.accent, rx: 1.5 }),
      text(gx + 18, 132, "OpenHabits", {
        size: 46,
        fill: t.fg,
        weight: 700,
        spacing: "-1.2",
      }),
      text(
        gx,
        170,
        "A habit tracker that draws your year as a contribution grid.",
        { size: 17, fill: t.muted },
      ),
      pills,
      monthLabels,
      cells,
      legend,
    ].join("\n"),
  );
}

/* ------------------------------------------------------------------ write --- */

const write = (name, content) => {
  writeFileSync(new URL(name, OUT), content);
  console.log("docs/media/" + name);
};

for (const [mode, t] of Object.entries(THEMES))
  write(`banner-${mode}.svg`, banner(t));
