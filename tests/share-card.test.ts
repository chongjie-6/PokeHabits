/**
 * The canvas-free part of `lib/share-card.ts`: the arithmetic deciding whether
 * the last week lands inside the image or half a cell off the edge. The one
 * failure that ships silently, a slightly wrong card still looking like one.
 */

import { describe, expect, it } from "vitest";
import { geometry } from "@/lib/share-card";

const PAD = 72;
const STEP = 27;
const GAP = 5;

describe("geometry", () => {
  it("fits the whole grid inside the image, at every width", () => {
    for (const weeks of [1, 4, 20, 26, 53]) {
      const { width, left } = geometry(weeks);
      const right = left + weeks * STEP - GAP;

      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(width);
    }
  });

  it("centres a grid narrower than the card", () => {
    const { width, left } = geometry(4);
    const right = left + 4 * STEP - GAP;
    // Equal margins either side, to the rounding.
    expect(Math.abs(left - (width - right))).toBeLessThanOrEqual(1);
  });

  it("holds a floor width, so a short window is a card and not a strip", () => {
    expect(geometry(1).width).toBe(geometry(4).width);
    expect(geometry(1).width).toBeGreaterThanOrEqual(1080);
  });

  it("grows past the floor once the grid needs it", () => {
    const year = geometry(53);
    expect(year.width).toBe(53 * STEP - GAP + PAD * 2);
    expect(year.width).toBeGreaterThan(geometry(20).width);
  });

  it("keeps the same height whatever the window, because the grid is 7 deep", () => {
    // Seven rows is seven rows: only the width tracks the number of weeks.
    expect(geometry(53).height).toBe(geometry(4).height);
    expect(geometry(53).gridBottom).toBe(geometry(4).gridBottom);
  });

  it("leaves room under the grid for the figures and the footer", () => {
    const { height, gridBottom } = geometry(26);
    expect(height).toBeGreaterThan(gridBottom + 100);
  });

  it("survives a window of no weeks at all", () => {
    // Reachable from a stats window that has not been built yet; it must not
    // produce a zero-width canvas, which `toBlob` rejects.
    const { width, height } = geometry(0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
