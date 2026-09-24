import { describe, expect, it } from "vitest";
import { AA_TEXT, contrastRatio, relativeLuminance } from "@/lib/contrast";
import { oklchToHex, parseHex } from "@/lib/oklch";
import {
  audit,
  derivePalette,
  deriveSwatches,
  isPaletteHex,
  normalisePalette,
  PALETTE_TOKENS,
  PRESETS,
  TOKEN_GROUPS,
  type Mode,
} from "@/lib/palette";

describe("contrast", () => {
  it("matches the WCAG reference extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#216e39", "#fbfbf9")).toBeCloseTo(
      contrastRatio("#fbfbf9", "#216e39")!,
      10,
    );
  });

  it("agrees with the measurement recorded in globals.css", () => {
    // The header of app/globals.css claims classic's --muted clears AA on
    // --surface-2 with almost no headroom: 4.55:1. If that stops being true the
    // comment is wrong, which matters more than this test failing.
    const ratio = contrastRatio("#6f6f68", "#f3f3f0")!;
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio).toBeLessThan(4.7);
  });

  it("is null when a value cannot be measured", () => {
    expect(contrastRatio("transparent", "#ffffff")).toBeNull();
  });

  it("puts white above black on luminance", () => {
    expect(relativeLuminance(parseHex("#ffffff")!)).toBeCloseTo(1, 5);
    expect(relativeLuminance(parseHex("#000000")!)).toBeCloseTo(0, 5);
  });
});

describe("deriveSwatches", () => {
  const modes: Mode[] = ["light", "dark"];

  it("fills every token with a full lowercase hex", () => {
    for (const mode of modes) {
      const swatches = deriveSwatches("#3b4cca", mode);
      for (const token of PALETTE_TOKENS) {
        expect(isPaletteHex(swatches[token]), `${mode} ${token}`).toBe(true);
      }
    }
  });

  /**
   * The point of deriving rather than hand-authoring: any hue clears the bar
   * the shipped skins were measured against. A failure here is an inaccessible
   * theme reachable through the ordinary path.
   */
  it("passes its own audit at every hue", () => {
    for (let hue = 0; hue < 360; hue += 10) {
      // A vivid seed at the hue under test, via a saturated HSL-ish triple.
      const seed = seedForHue(hue);
      for (const mode of modes) {
        for (const row of audit(deriveSwatches(seed, mode))) {
          expect(
            row.passes,
            `hue ${hue} ${mode}: ${row.label} at ${row.ratio.toFixed(2)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("passes for a near-grey seed, where there is no hue to work with", () => {
    for (const mode of modes) {
      for (const row of audit(deriveSwatches("#4b5563", mode))) {
        expect(row.passes, `${mode}: ${row.label}`).toBe(true);
      }
    }
  });

  it("keeps light light and dark dark", () => {
    const light = deriveSwatches("#0c8599", "light");
    const dark = deriveSwatches("#0c8599", "dark");
    expect(relativeLuminance(parseHex(light["--background"])!)).toBeGreaterThan(
      0.8,
    );
    expect(relativeLuminance(parseHex(dark["--background"])!)).toBeLessThan(
      0.05,
    );
  });

  it("builds a ramp that climbs in one direction", () => {
    for (const mode of modes) {
      const s = deriveSwatches("#216e39", mode);
      const steps = (["--hm-1", "--hm-2", "--hm-3", "--hm-4"] as const).map(
        (token) => relativeLuminance(parseHex(s[token])!),
      );
      const rising = steps.every((v, i) => i === 0 || v > steps[i - 1]);
      const falling = steps.every((v, i) => i === 0 || v < steps[i - 1]);
      expect(rising || falling, `${mode}: ${steps.join(", ")}`).toBe(true);
    }
  });

  it("tints the neutrals without colouring them", () => {
    const vivid = deriveSwatches("#c2410c", "light");
    const grey = deriveSwatches("#4b5563", "light");
    // Both page backgrounds should still read as near-white.
    for (const swatches of [vivid, grey]) {
      const { r, g, b } = parseHex(swatches["--background"])!;
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.05);
    }
  });
});

describe("presets", () => {
  it("every shipped preset passes in both modes", () => {
    for (const preset of PRESETS) {
      const palette = derivePalette(preset.seed);
      for (const mode of ["light", "dark"] as const) {
        for (const row of audit(palette[mode])) {
          expect(row.passes, `${preset.label} ${mode}: ${row.label}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("gives each preset a distinct accent", () => {
    const accents = PRESETS.map((p) => derivePalette(p.seed).light["--accent"]);
    expect(new Set(accents).size).toBe(PRESETS.length);
  });
});

describe("normalisePalette", () => {
  const valid = derivePalette("#216e39");

  it("accepts a palette it built", () => {
    expect(normalisePalette(valid)).toEqual(valid);
  });

  it("survives a JSON round trip, which is how it is stored", () => {
    expect(normalisePalette(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it("lowercases, so a hand-edited value cannot change the stored form", () => {
    const shouty = {
      ...valid,
      light: { ...valid.light, "--accent": "#216E39" },
    };
    expect(normalisePalette(shouty)!.light["--accent"]).toBe("#216e39");
  });

  it("rejects a partial palette rather than filling the gaps from the skin", () => {
    const missing = { ...valid, light: { ...valid.light } } as Record<
      string,
      unknown
    >;
    delete (missing.light as Record<string, unknown>)["--ring"];
    expect(normalisePalette(missing)).toBeNull();
  });

  it("rejects a mode that is not there", () => {
    expect(normalisePalette({ light: valid.light })).toBeNull();
  });

  it("rejects a value that is not a hex", () => {
    const bad = { ...valid, dark: { ...valid.dark, "--surface": "red" } };
    expect(normalisePalette(bad)).toBeNull();
  });

  it("rejects a value carrying anything but a colour", () => {
    // The pre-paint script writes stored values straight into an inline style.
    const bad = {
      ...valid,
      dark: { ...valid.dark, "--surface": "url(https://x/)" },
    };
    expect(normalisePalette(bad)).toBeNull();
  });

  it("rejects the shapes localStorage can actually hand back", () => {
    for (const value of [
      null,
      undefined,
      "",
      "{}",
      0,
      [],
      { light: 1, dark: 2 },
    ]) {
      expect(normalisePalette(value)).toBeNull();
    }
  });
});

describe("the editor's token list", () => {
  it("covers every token exactly once", () => {
    const listed = TOKEN_GROUPS.flatMap((group) =>
      group.tokens.map((t) => t.token),
    );
    expect(listed.slice().sort()).toEqual(PALETTE_TOKENS.slice().sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
});

/**
 * A vivid seed at a given hue, as a hex — which is the only thing the editor
 * can hand `deriveSwatches`, since it comes from an `<input type="color">`.
 */
function seedForHue(hue: number): string {
  return oklchToHex({ l: 0.55, c: 0.16, h: hue });
}
