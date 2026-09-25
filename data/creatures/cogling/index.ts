import type { Creature } from "@/lib/types";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const BRASS = { b: "#d0a24c", l: "#f0d48a", d: "#a07430" };
const EMPTY = "#ebedf0";

/**
 * Outside the weekly order, all three at #000: found by opening settings, and
 * the two forms by opening it in their skin (§5.5).
 */
const line: Creature[] = [
  {
    id: "cogling",
    name: "Cogling",
    blurb:
      "Lives behind the settings. Turns a notch one way, a notch the other, and clicks when everything is just so.",
    colors: { o: OUTLINE, w: SHINE, ...BRASS },
    sprite: [
      ".....oooo.....",
      ".oo..obbo..oo.",
      ".obooobbooobo.",
      "..ollbbbbbbo..",
      "..olbbbbbbbo..",
      "ooobbbbbbbbooo",
      "obbbwobbwobbbo",
      "obbboobboobbbo",
      "ooobbbbbbbbooo",
      "..obbboobbdo..",
      "..obbbbbbddo..",
      ".obooobbooobo.",
      ".oo..obbo..oo.",
      ".....oooo.....",
    ],
    rig: {
      // The whole cog, so its drawn box is 14 by 14 and quarter turns stay on the grid.
      parts: { cog: [0, 0, 14, 14] },
      fx: { click: pixelsAt(12, -3, [".d.", "d.d", ".d."]) },
    },
  },
  {
    id: "blockog",
    name: "Blockog",
    blurb:
      "Cogling, rebuilt in blocks. Comes apart at the seams to check every tile is square, then clunks back together.",
    colors: { o: OUTLINE, w: SHINE, ...BRASS },
    sprite: [
      ".....oooo.....",
      ".....obbo.....",
      "..oooobboooo..",
      "..ollllllllo..",
      "..olwodlwodo..",
      "oooloodloodooo",
      "obbddddddddbbo",
      "obbllllllllbbo",
      "ooolbbdlbbdooo",
      "..olbboobbdo..",
      "..oddddddddo..",
      "..oooobboooo..",
      ".....obbo.....",
      ".....oooo.....",
    ],
    rig: {
      parts: {
        tl: [0, 0, 7, 7],
        tr: [7, 0, 7, 7],
        bl: [0, 7, 7, 7],
        br: [7, 7, 7, 7],
      },
    },
  },
  {
    id: "latticog",
    name: "Latticog",
    blurb:
      "Cogling, reset to a grid. Every cell is a day, and it fills them in column by column, like a year.",
    // `p` to `u` are the cells it fills, in order; the idle loop reaches them by key.
    colors: {
      o: OUTLINE,
      w: SHINE,
      b: BRASS.b,
      e: EMPTY,
      h: "#9be9a8",
      g: "#40c463",
      p: EMPTY,
      q: EMPTY,
      r: EMPTY,
      s: EMPTY,
      t: EMPTY,
      u: EMPTY,
    },
    sprite: [
      ".....oooo.....",
      ".oo..obbo..oo.",
      ".obooobbooobo.",
      "..oppbrrbtto..",
      "..oppbrrbtto..",
      "ooobbbbbbbbooo",
      "obbwobssbwobbo",
      "obboobssboobbo",
      "ooobbbbbbbbooo",
      "..oqqboobuuo..",
      "..oqqbbbbuuo..",
      ".obooobbooobo.",
      ".oo..obbo..oo.",
      ".....oooo.....",
    ],
    rig: {},
  },
];

export default line;
