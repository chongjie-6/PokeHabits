import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { CREATURES, discoveries } from "@/lib/creatures";
import type { DayStat } from "@/lib/history";

const DEX = CREATURES;

/** Monday 2026-08-03 onward; each entry is one day's `[completed, scheduled]`. */
function stats(days: [number, number][], preStart = false): DayStat[] {
  return days.map(([completed, scheduled], i) => ({
    date: addDays("2026-08-03", i),
    scheduled,
    completed,
    score: scheduled === 0 ? null : completed / scheduled,
    level: scheduled === 0 ? "rest" : 4,
    preStart,
  }));
}

const week = (completed: number, scheduled: number): [number, number][] => [
  [completed, scheduled],
  ...Array.from({ length: 6 }, (): [number, number] => [0, 0]),
];

// Two weeks later, so every fixture week has ended.
const LATER = "2026-09-01";

describe("discoveries", () => {
  it("counts a finished week at exactly the threshold", () => {
    expect(discoveries(stats(week(8, 10)), LATER, 1).found).toBe(1);
  });

  it("does not count a week just under it", () => {
    expect(discoveries(stats(week(79, 100)), LATER, 1).found).toBe(0);
  });

  it("skips a week with nothing scheduled", () => {
    expect(discoveries(stats(week(0, 0)), LATER, 1).found).toBe(0);
  });

  it("never counts the week still in progress", () => {
    const result = discoveries(stats(week(5, 5)), "2026-08-05", 1);
    expect(result.found).toBe(0);
    expect(result.thisWeek).toEqual({ completed: 5, scheduled: 5 });
  });

  it("ignores days before the first habit", () => {
    expect(discoveries(stats(week(5, 5), true), LATER, 1).found).toBe(0);
  });

  it("finds one creature per qualifying week, capped at the corpus", () => {
    const good = Array.from({ length: CREATURES.length + 3 }, () =>
      week(1, 1),
    ).flat();
    const bad = [...week(1, 1), ...week(0, 1), ...week(1, 1)];
    expect(discoveries(stats(bad), "2027-01-01", 1).found).toBe(2);
    expect(
      discoveries(stats(good), addDays("2026-08-03", good.length), 1).found,
    ).toBe(CREATURES.length);
  });
});

describe("the dex", () => {
  it("has unique ids", () => {
    const ids = DEX.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws every sprite as a square using only its own colours", () => {
    for (const { id, sprite, colors } of DEX) {
      for (const row of sprite) {
        expect(row.length, id).toBe(sprite.length);
        for (const pixel of row) {
          if (pixel !== ".")
            expect(colors[pixel], `${id} ${pixel}`).toBeTruthy();
        }
      }
    }
  });
});

describe("creature rigs", () => {
  it("lift disjoint, non-empty boxes and paint effects in known colours", () => {
    for (const { id, sprite, colors, rig } of DEX) {
      const claimed = new Set<string>();
      for (const [name, [x, y, w, h]] of Object.entries(rig?.parts ?? {})) {
        let drawn = 0;
        for (let row = y; row < y + h; row++) {
          for (let col = x; col < x + w; col++) {
            const pixel = sprite[row]?.[col];
            expect(pixel, `${id}.${name} leaves the grid`).toBeDefined();
            expect(claimed.has(`${col},${row}`), `${id}.${name}`).toBe(false);
            claimed.add(`${col},${row}`);
            if (pixel !== ".") drawn++;
          }
        }
        expect(drawn, `${id}.${name} is empty`).toBeGreaterThan(0);
      }
      for (const [name, pixels] of Object.entries(rig?.fx ?? {})) {
        for (const [, , key] of pixels) {
          expect(colors[key], `${id}.${name}`).toBeDefined();
        }
      }
    }
  });
});

// CSS names parts, effects and colours by string, so a typo there animates
// nothing and throws nothing. Reading the stylesheets back is the only check.
describe("idle loops", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const dir = join(root, "data/creatures");
  const lines = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => {
      const idle = join(dir, name, "idle.css");
      const styled = existsSync(idle);
      return {
        name,
        ids: [
          ...readFileSync(join(dir, name, "index.ts"), "utf8").matchAll(
            /id: "([\w-]+)"/g,
          ),
        ].map((m) => m[1]),
        styled,
        css: styled
          ? readFileSync(idle, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
          : "",
      };
    });
  const rig = readFileSync(join(root, "app/dex/rig.css"), "utf8");
  const keyframes = (css: string) =>
    [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);

  it("belong to lines the corpus lists", () => {
    const listed = new Set(DEX.map((c) => c.id));
    for (const { name, ids } of lines) {
      for (const id of ids) {
        expect(listed.has(id), `${name}/${id} is not in the dex`).toBe(true);
      }
    }
  });

  it("are all imported by the dex", () => {
    const entry = readFileSync(join(root, "app/dex/idle.css"), "utf8");
    for (const { name, styled } of lines) {
      if (!styled) continue;
      expect(entry).toContain(
        `@import "../../data/creatures/${name}/idle.css";`,
      );
    }
  });

  it("only name parts, effects and colours their own creature has", () => {
    const rigs = { part: "parts", fx: "fx" } as const;
    for (const { name, ids, css } of lines) {
      const selectors = [...css.matchAll(/([^{}]+)\{/g)]
        .flatMap((m) => m[1].split(","))
        .filter((s) => s.includes("[data-creature"));
      const animated = new Set<string>();
      for (const selector of selectors) {
        const id = selector.match(/\[data-creature="([\w-]+)"\]/)?.[1];
        expect(ids, `${name}: ${selector.trim()}`).toContain(id);
        const creature = DEX.find((c) => c.id === id);
        expect(creature, `${id} is not in the dex`).toBeDefined();
        animated.add(id!);
        for (const [, attr, prefix, value] of selector.matchAll(
          /\[data-(part|fx|px)(\^?)="(\w+)"\]/g,
        )) {
          const names = Object.keys(
            attr === "px"
              ? creature!.colors
              : (creature!.rig?.[rigs[attr as keyof typeof rigs]] ?? {}),
          );
          const found = prefix
            ? names.some((n) => n.startsWith(value))
            : names.includes(value);
          expect(found, `${id}: data-${attr}${prefix}="${value}"`).toBe(true);
        }
      }
      for (const id of ids) {
        if (DEX.find((c) => c.id === id)?.rig)
          expect(animated.has(id), `${id} has a rig but no loop`).toBe(true);
      }
    }
  });

  it("own their keyframes, and only play keyframes that exist", () => {
    const all = [rig, ...lines.map((l) => l.css)].flatMap(keyframes);
    expect(all.length).toBe(new Set(all).size);
    for (const { name, ids, css } of lines) {
      for (const frames of keyframes(css)) {
        expect(
          ids.some((id) => frames.startsWith(`idle-${id}-`)),
          `${name}: @keyframes ${frames}`,
        ).toBe(true);
      }
      for (const [, played] of css.matchAll(/animation:\s*([\w-]+)/g)) {
        expect(all, `${name}: animation ${played}`).toContain(played);
      }
    }
  });
});
