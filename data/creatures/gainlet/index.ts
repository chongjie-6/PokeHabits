import type { Creature } from "@/lib/types";
import { OUTLINE, SHINE, pixelsAt } from "../pixels";

const SKIN = {
  o: OUTLINE,
  w: SHINE,
  e: OUTLINE,
  b: "#45b39d",
  l: "#c4ecd9",
  r: "#e0493e",
  d: "#8fd4ff",
};
const IRON = { p: "#6b7089", s: "#a9aec2" };

const line: Creature[] = [
  {
    id: "gainlet",
    name: "Gainlet",
    blurb:
      "Flexes at every puddle it passes. Nothing there yet. It flexes anyway.",
    colors: SKIN,
    sprite: [
      ".oo...oo....",
      "owwo.owwo...",
      "oweoooweo...",
      "orrrrrrro...",
      "obbbbbbbo.o.",
      "obobbboboobo",
      "obbooobbobbo",
      "oblllllbbbbo",
      "oblllllbooo.",
      "obblllbbo...",
      "obbbobbbo...",
      ".ooo.ooo....",
    ],
    rig: {
      parts: { arm: [9, 4, 3, 5] },
      fx: { sweat: [[9, 2, "d"]] },
    },
  },
  {
    id: "repcroak",
    name: "Repcroak",
    blurb: "Croaks once for every rep. Has never lost count, or stopped early.",
    colors: { ...SKIN, ...IRON },
    sprite: [
      "..ooo..ooo.o...o",
      ".owwwoowwwopooop",
      ".owweoowweopsssp",
      ".orrrrrrrropbbop",
      ".obbbbbbbboobboo",
      ".obobbbboboobbo.",
      ".obboooobboobbo.",
      ".obbbbbbbbobbbo.",
      ".obllllllbbbbbo.",
      ".obllllllbooo...",
      ".obllllllbo.....",
      ".obbllllbbo.....",
      "obbbbbbbbbbo....",
      "obbbboobbbbo....",
      ".obbo..obbo.....",
      "ooooo..ooooo....",
    ],
    rig: {
      parts: { bell: [11, 0, 5, 4] },
      fx: { sac: pixelsAt(3, 7, ["ollllo", ".oooo."]) },
    },
  },
  {
    id: "croaklossus",
    name: "Croaklossus",
    blurb: "Never skips leg day. Never skips the other six, either.",
    colors: { ...SKIN, ...IRON, n: "#8a5a34", y: "#f2c14e" },
    sprite: [
      "oooo............oooo",
      "oppo............oppo",
      "oppooooooooooooooppo",
      "oppobbssssssssbboppo",
      "oppobboooooooobboppo",
      "oppobbowwoowwobboppo",
      "oooobboweooweobboooo",
      "...obborrrrrrobbo...",
      "..obbbobbbbbbobbbo..",
      "..obbboboooobobbbo..",
      "..obbbobbbbbbobbbo..",
      "..obbllllllllllbbo..",
      "...obllllllllllbo...",
      "...obllllllllllbo...",
      "...onnnnnyynnnnno...",
      "...onnnnnyynnnnno...",
      "..obbbbbbbbbbbbbbo..",
      ".obbbbbboooobbbbbbo.",
      ".obbbo........obbbo.",
      "oooooo........oooooo",
    ],
    rig: {
      parts: { top: [0, 0, 20, 16] },
      fx: {
        dust: [
          [-1, 19, "s"],
          [-2, 18, "s"],
          [20, 19, "s"],
          [21, 18, "s"],
        ],
      },
    },
  },
];

export default line;
