/**
 * Generates the PWA icon set. Run with `node scripts/generate-icons.mjs`.
 *
 * Hand-rolled rather than pulled from a design tool so the icons are
 * reproducible and the repo stays dependency-free: a tiny PNG encoder plus a
 * software rasteriser is less machinery than an image pipeline, and the artwork
 * — a 3×3 slice of the contribution grid — is describable in about ten lines.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BACKGROUND = [0x1a, 0x4d, 0x2c, 0xff];
const SHADES = {
  1: [0x2a, 0x82, 0x48, 0xff],
  2: [0x40, 0xc4, 0x63, 0xff],
  3: [0x9b, 0xe9, 0xa8, 0xff],
  4: [0xff, 0xff, 0xff, 0xff],
};

// A 3×3 slice of a contribution grid.
const PATTERN = [
  [2, 3, 1],
  [3, 4, 2],
  [1, 2, 3],
];

/** Fraction of the canvas the grid occupies. 0.56 keeps it inside the
 *  maskable safe zone: 0.56 × √2 ≈ 0.79, just under the 0.8 diameter. */
const GRID_SCALE = 0.56;
const SAMPLES = 3; // supersampling factor per axis

function roundedRectCoverage(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function blend(dst, offset, colour, alpha) {
  for (let c = 0; c < 3; c++) {
    dst[offset + c] = Math.round(
      dst[offset + c] * (1 - alpha) + colour[c] * alpha,
    );
  }
  dst[offset + 3] = 255;
}

function render(size, { fullBleed }) {
  const pixels = Buffer.alloc(size * size * 4);

  // Background: full bleed for maskable, rounded for the plain icon.
  const bgRadius = fullBleed ? 0 : size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          if (
            bgRadius === 0 ||
            roundedRectCoverage(px, py, 0, 0, size, size, bgRadius)
          ) {
            hits++;
          }
        }
      }
      const alpha = hits / (SAMPLES * SAMPLES);
      const offset = (y * size + x) * 4;
      pixels[offset + 3] = Math.round(alpha * 255);
      if (alpha > 0) {
        pixels[offset] = BACKGROUND[0];
        pixels[offset + 1] = BACKGROUND[1];
        pixels[offset + 2] = BACKGROUND[2];
      }
    }
  }

  // The grid.
  const grid = size * GRID_SCALE;
  const gap = grid * 0.08;
  const cell = (grid - gap * 2) / 3;
  const radius = cell * 0.18;
  const origin = (size - grid) / 2;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const colour = SHADES[PATTERN[row][col]];
      const cx = origin + col * (cell + gap);
      const cy = origin + row * (cell + gap);

      const x0 = Math.max(0, Math.floor(cx) - 1);
      const y0 = Math.max(0, Math.floor(cy) - 1);
      const x1 = Math.min(size, Math.ceil(cx + cell) + 1);
      const y1 = Math.min(size, Math.ceil(cy + cell) + 1);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          let hits = 0;
          for (let sy = 0; sy < SAMPLES; sy++) {
            for (let sx = 0; sx < SAMPLES; sx++) {
              if (
                roundedRectCoverage(
                  x + (sx + 0.5) / SAMPLES,
                  y + (sy + 0.5) / SAMPLES,
                  cx,
                  cy,
                  cell,
                  cell,
                  radius,
                )
              ) {
                hits++;
              }
            }
          }
          if (hits === 0) continue;
          blend(pixels, (y * size + x) * 4, colour, hits / (SAMPLES * SAMPLES));
        }
      }
    }
  }

  return pixels;
}

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Filter type 0 (none) on every scanline. The artwork is flat colour, so
  // deflate does the compression work regardless.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO encoding ----------------------------------------------------------

/**
 * An .ico carrying PNG payloads rather than the older BMP-with-AND-mask form.
 * Every browser that still asks for `/favicon.ico` understands it, and the
 * alternative is a second rasteriser for a format nothing else here needs.
 */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;

  entries.forEach(({ size, png }, index) => {
    const at = index * 16;
    // 0 means 256 in this field; nothing here is that large, but the encoding
    // is the format's, not ours to reinterpret.
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory[at + 2] = 0; // palette size
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

// --- SVG -------------------------------------------------------------------

function hex(colour) {
  return `#${colour
    .slice(0, 3)
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The same artwork as `render`, described rather than rasterised.
 *
 * A tab favicon is drawn at 16px on one screen and 32 on the next, and the
 * rasteriser above supersamples at a fixed size; the vector is simply correct
 * at both. Geometry is duplicated from `render` deliberately — factoring it out
 * would mean an abstraction over "a rounded rect in pixels" and "a rounded rect
 * in user units" that is longer than either.
 */
function renderSvg(size) {
  const grid = size * GRID_SCALE;
  const gap = grid * 0.08;
  const cell = (grid - gap * 2) / 3;
  const radius = cell * 0.18;
  const origin = (size - grid) / 2;

  const round = (n) => Number(n.toFixed(3));
  const squares = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      squares.push(
        `<rect x="${round(origin + col * (cell + gap))}" y="${round(
          origin + row * (cell + gap),
        )}" width="${round(cell)}" height="${round(cell)}" rx="${round(radius)}" fill="${hex(
          SHADES[PATTERN[row][col]],
        )}"/>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="OpenHabits">
  <rect width="${size}" height="${size}" rx="${round(size * 0.22)}" fill="${hex(BACKGROUND)}"/>
  ${squares.join("\n  ")}
</svg>
`;
}

// --- Output ----------------------------------------------------------------

const targets = [
  { path: "public/icon-192.png", size: 192, fullBleed: false },
  { path: "public/icon-512.png", size: 512, fullBleed: false },
  { path: "public/icon-maskable-512.png", size: 512, fullBleed: true },
  { path: "app/apple-icon.png", size: 180, fullBleed: true },
];

function write(path, data) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
}

for (const { path, size, fullBleed } of targets) {
  write(path, encodePng(size, render(size, { fullBleed })));
  console.log(`wrote ${path} (${size}\u00d7${size})`);
}

// `app/icon.svg` is what Next turns into `<link rel="icon">`; `app/favicon.ico`
// is for the browsers and feed readers that request the well-known path
// directly and never read the markup.
write("app/icon.svg", renderSvg(512));
console.log("wrote app/icon.svg (vector)");

const ICO_SIZES = [16, 32, 48];
write(
  "app/favicon.ico",
  encodeIco(
    ICO_SIZES.map((size) => ({
      size,
      png: encodePng(size, render(size, { fullBleed: false })),
    })),
  ),
);
console.log(`wrote app/favicon.ico (${ICO_SIZES.join(", ")})`);
