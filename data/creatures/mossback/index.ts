import type { Creature } from "@/lib/types";
import { OUTLINE, SHINE } from "../pixels";

const line: Creature[] = [
  {
    id: "mossback",
    name: "Mossback",
    blurb:
      "Slow, and never late. Moss grows on its shell because it keeps still.",
    colors: { o: OUTLINE, w: SHINE, b: "#c9b27c", l: "#5f8f4e" },
    sprite: [
      "............",
      "............",
      "............",
      "...oooooo...",
      "..olloollooo",
      ".olloollobwo",
      ".ooooooooboo",
      ".obbbbbbbbo.",
      ".obo....obo.",
      ".oo.....oo..",
      "............",
      "............",
    ],
    rig: {
      parts: { head: [9, 4, 3, 3] },
      fx: {
        neck: [
          [9, 4, "o"],
          [9, 5, "b"],
          [9, 6, "b"],
        ],
        moss1: [[6, 2, "l"]],
        moss2: [
          [5, 2, "l"],
          [6, 1, "l"],
        ],
      },
    },
  },
  {
    id: "elderback",
    name: "Elderback",
    blurb:
      "Grew out of a Mossback. Kept still so long that its shell turned into a garden.",
    colors: {
      o: OUTLINE,
      w: SHINE,
      b: "#c9b27c",
      l: "#5f8f4e",
      m: "#3f6b3a",
      f: "#f2a0bd",
      y: "#f2c14e",
    },
    sprite: [
      "................",
      ".......o........",
      "......ofo.......",
      ".......ml.......",
      "......lm........",
      "....oooooo......",
      "..oolllmlloo....",
      ".olllllmllllo...",
      ".ollmmllllmlooo.",
      "ollllmllllllobwo",
      "olmllllllmllobbo",
      "ooolooooolooooo.",
      ".obbbbbbbbbbo...",
      ".obbo....obbo...",
      ".oooo....oooo...",
      "................",
    ],
    rig: {
      fx: {
        bloom: [
          [7, 2, "y"],
          [7, 1, "f"],
          [6, 2, "f"],
          [8, 2, "f"],
          [7, 3, "f"],
        ],
        petal: [[9, 2, "f"]],
      },
    },
  },
];

export default line;
