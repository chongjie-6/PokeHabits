/**
 * The link-preview card. See DESIGN.md §8.6. Deliberately the same picture the
 * verification email paints: those two surfaces are the only places OpenHabits
 * is seen by someone who has not installed it. Rendered once at build time, and
 * no emoji anywhere — `ImageResponse` resolves those against a CDN, and a build
 * that reaches the network is a build that can fail offline.
 */

import { ImageResponse } from "next/og";

export const alt = "OpenHabits — a square for every day of the year";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1a1a19";
const MUTED = "#6f6f68";
const SURFACE = "#fbfbf9";
const CELL_EMPTY = "#e3e5e8";
const CELL_LIT = "#30a14e";

const COLUMNS = 21;
const ROWS = 7;
/** A plausible fortnight: a regular pattern reads as a loading skeleton. */
const LIT = new Set([
  "0,2",
  "1,2",
  "2,3",
  "3,3",
  "4,4",
  "5,4",
  "6,5",
  "0,6",
  "2,6",
  "3,7",
  "4,7",
  "1,8",
  "2,8",
  "5,9",
  "3,10",
  "4,10",
  "6,10",
  "0,11",
  "1,11",
  "2,12",
  "3,12",
  "4,13",
  "5,13",
  "0,14",
  "1,15",
  "2,15",
  "3,16",
  "4,16",
  "5,17",
  "6,17",
  "1,18",
  "2,18",
  "3,19",
  "4,19",
  "5,20",
]);

export default function Image() {
  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      cells.push(
        <div
          key={`${row},${column}`}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: LIT.has(`${row},${column}`)
              ? CELL_LIT
              : CELL_EMPTY,
          }}
        />,
      );
    }
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: SURFACE,
        padding: "0 80px",
      }}
    >
      {/* Satori has no `display: grid`, so the grid is a wrapping flex row
            sized to exactly 21 columns. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: COLUMNS * 34 + (COLUMNS - 1) * 10,
          gap: 10,
          marginBottom: 56,
        }}
      >
        {cells}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 68,
          color: INK,
          letterSpacing: -1.5,
        }}
      >
        OpenHabits
      </div>
      <div
        style={{ display: "flex", marginTop: 20, fontSize: 30, color: MUTED }}
      >
        A daily quote, and the year you had.
      </div>
    </div>,
    size,
  );
}
