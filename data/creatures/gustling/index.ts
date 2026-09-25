import type { Creature } from "@/lib/types";
import { OUTLINE, SHINE } from "../pixels";

const line: Creature[] = [
  {
    id: "gustling",
    name: "Gustling",
    blurb: "Rides the first breeze of the day and is home before dark.",
    colors: { o: OUTLINE, w: SHINE, b: "#e8eef2", l: "#f2c14e", g: "#a7c4d8" },
    sprite: [
      "............",
      "....oooo....",
      "...obbbbo...",
      "..obwobbbo..",
      "..obbbbbboll",
      ".oollbbbbo..",
      "olllllbbbo..",
      ".oollbbbbo..",
      "..obbbbbo...",
      "...oooooo...",
      "....o..o....",
      "............",
    ],
    rig: {
      parts: { wing: [0, 5, 5, 3] },
      fx: {
        gustA: [
          [0, 0, "g"],
          [1, 0, "g"],
          [2, 0, "g"],
        ],
        gustB: [
          [0, 11, "g"],
          [1, 11, "g"],
        ],
      },
    },
  },
  {
    id: "galecrest",
    name: "Galecrest",
    blurb:
      "Grew out of a Gustling. Stopped waiting for the breeze, and now makes its own.",
    colors: {
      o: OUTLINE,
      w: SHINE,
      b: "#e8eef2",
      l: "#f2c14e",
      k: "#d9a23a",
      g: "#a7c4d8",
    },
    sprite: [
      "..........l.....",
      ".o.........ll...",
      "olo.......oooo..",
      "olko.....obbbbo.",
      ".olklo...obwobo.",
      ".ollklo..obbbbll",
      "..ollllkobbbbbo.",
      "...ollllllbbbbo.",
      "....oooooobbbbo.",
      "...obbbbbbbbbbo.",
      "olllobbbbbbbbo..",
      ".olllobbbbbbo...",
      "..ooo.oooooo....",
      "........o..o....",
      ".......oo.oo....",
      "................",
    ],
    rig: {
      parts: { wing: [0, 1, 9, 8], crest: [10, 0, 3, 2] },
      fx: {
        gustA: [
          [0, 8, "g"],
          [1, 8, "g"],
          [2, 8, "g"],
        ],
        gustB: [
          [1, 14, "g"],
          [2, 14, "g"],
        ],
      },
    },
  },
];

export default line;
