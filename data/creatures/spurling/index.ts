import type { Creature } from "@/lib/types";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const colors = {
  o: OUTLINE,
  w: SHINE,
  b: "#565a70",
  l: "#8d91a8",
  s: "#f4efe3",
  k: "#15121b",
  h: "#a8916a",
  d: "#33354a",
};

const line: Creature[] = [
  {
    id: "spurling",
    name: "Spurling",
    blurb:
      "Breaks its spines on everything. Each one grows back a little harder.",
    colors,
    sprite: [
      "............",
      "k...o..o...k",
      ".h.osooso.h.",
      ".hoosoosooh.",
      ".obbbbbbbbo.",
      ".obwobbwobo.",
      ".obbbbbbbbo.",
      ".obbboobbbo.",
      "oobbllllbboo",
      "obobllllbobo",
      "oo.obbbbo.oo",
      "...oo..oo...",
    ],
    rig: {
      parts: { spine: [7, 1, 1, 2] },
      fx: {
        chip: [
          [7, 1, "o"],
          [7, 2, "s"],
        ],
      },
    },
  },
  {
    id: "quillrend",
    name: "Quillrend",
    blurb:
      "Throws its spines at every problem. By morning they have grown back tougher.",
    colors: { ...colors, b: "#4e5167" },
    sprite: [
      "................",
      ".......k........",
      ".......k........",
      "......oso.......",
      "......oso....hh.",
      "....k.oso..oho.k",
      "...osoosookoobo.",
      ".ooosbbbbbbbwobo",
      "kbbbbbbbbbbbbbbo",
      ".oobbbbbbbbboso.",
      "..obbllllbbbbbo.",
      "..obbbooobbboo..",
      "..obbbo.kbblo...",
      "..obbbo..obblo..",
      "..obbbbo.obbbbo.",
      "...oooo...osos..",
    ],
    rig: {
      parts: { spine: [6, 1, 3, 4] },
      fx: { volley: pixelsAt(7, 1, ["k", "k", "s"]) },
    },
  },
  {
    id: "wrathorn",
    name: "Wrathorn",
    blurb:
      "Every spine it ever broke grew back black. It still throws itself at every day.",
    colors: { ...colors, b: "#474a5f" },
    sprite: [
      "k...kok...k.........",
      ".kookdlo.k......oo..",
      ".okllldlk..k...ohho.",
      "..oddldlo.k...ohooho",
      "..kkldddlk..koho..ok",
      "koolddddlo.kobbbo..k",
      "oklddddddlkobbbooo..",
      ".okldddddlobbbbwobo.",
      ".k.oddddddlbbbbbbbbo",
      "k...odddddlbbbososo.",
      ".okoobbbbbbbbbbbsbo.",
      "kbbbbbbbbbbbbboooo..",
      ".oobblllllllbbo.....",
      "...obblllllbbo......",
      "...obbbooobblo......",
      "..obbbo..okblo......",
      "..obbbo...obblo.....",
      "...obbbo..obblo.....",
      "...obbbbo.obbbbs....",
      "....oooo...osos.....",
    ],
    rig: {
      parts: { wing: [0, 0, 11, 8] },
      fx: {
        burstA: [
          [5, -1, "o"],
          [-1, 0, "o"],
          [12, 1, "o"],
        ],
        burstB: [
          [4, -3, "o"],
          [-1, 3, "o"],
          [13, 0, "o"],
        ],
        burstC: [
          [3, -5, "o"],
          [-3, 2, "o"],
          [14, -1, "o"],
        ],
        root: pixelsAt(0, 7, [".okldddddlo"]),
        dust: [
          [0, 18, "l"],
          [1, 19, "l"],
          [17, 19, "l"],
          [18, 18, "l"],
        ],
      },
    },
  },
];

export default line;
