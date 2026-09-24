import { describe, expect, it } from "vitest";
import {
  clipChroma,
  hexToOklch,
  oklchToHex,
  parseHex,
  rgbToOklch,
  toHex,
} from "@/lib/oklch";

describe("parseHex", () => {
  it("reads both hex lengths", () => {
    expect(parseHex("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseHex("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("is case insensitive", () => {
    expect(parseHex("#216E39")).toEqual(parseHex("#216e39"));
  });

  it("rejects anything it cannot measure", () => {
    for (const value of [
      "transparent",
      "rgb(0 0 0)",
      "#ff",
      "#ffff",
      "216e39",
      "",
    ]) {
      expect(parseHex(value)).toBeNull();
    }
  });
});

describe("round trips", () => {
  // The shipped palette, which is what any regression here would break first.
  const colours = [
    "#216e39",
    "#30a14e",
    "#9be9a8",
    "#fbfbf9",
    "#0d1117",
    "#c6f24e",
    "#000000",
    "#ffffff",
    "#d6336c",
  ];

  it("survives hex → OKLCh → hex", () => {
    for (const hex of colours) {
      expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
    }
  });

  it("reports no hue for a neutral", () => {
    expect(rgbToOklch({ r: 0.5, g: 0.5, b: 0.5 }).h).toBe(0);
    expect(rgbToOklch({ r: 0.5, g: 0.5, b: 0.5 }).c).toBeLessThan(1e-6);
  });

  it("orders lightness the way the eye does", () => {
    const dark = hexToOklch("#216e39")!;
    const light = hexToOklch("#9be9a8")!;
    expect(light.l).toBeGreaterThan(dark.l);
  });
});

describe("clipChroma", () => {
  it("holds hue while pulling an out-of-gamut colour back", () => {
    // Nothing in sRGB is this saturated at this lightness.
    const wanted = { l: 0.9, c: 0.4, h: 150 };
    const clipped = clipChroma(wanted);
    const got = rgbToOklch(clipped);

    expect(got.c).toBeLessThan(wanted.c);
    expect(got.l).toBeCloseTo(wanted.l, 2);
    expect(got.h).toBeCloseTo(wanted.h, 0);
  });

  it("leaves an in-gamut colour alone", () => {
    expect(toHex(clipChroma(hexToOklch("#30a14e")!))).toBe("#30a14e");
  });

  it("never emits a channel outside the byte range", () => {
    for (let h = 0; h < 360; h += 15) {
      for (const l of [0.05, 0.3, 0.6, 0.95]) {
        expect(oklchToHex({ l, c: 0.37, h })).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
