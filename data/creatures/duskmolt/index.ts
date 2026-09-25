import type { Creature } from "@/lib/types";
import { OUTLINE, SHINE } from "../pixels";

const line: Creature[] = [
  {
    id: "duskmolt",
    name: "Duskmolt",
    blurb: "Sheds one dark scale for every good day. Underneath, it is gold.",
    colors: { o: OUTLINE, b: "#54466b", m: "#8a74ab", l: "#f0c75e" },
    sprite: [
      "o..............o",
      "oo............oo",
      "obo..........obo",
      "obbo.o....o.obbo",
      "obmbo.o..o.obmbo",
      "obmmboooooobmmbo",
      "obbmmobbbbommbbo",
      "obbmmommmmommbbo",
      "obmbmobbbbombmbo",
      "obmbmoobboombmbo",
      "obmbmobllbombmbo",
      "oboboolllloobobo",
      "ob.o.obllbo.o.bo",
      "ob...obbbbo...bo",
      "ob...oboobo...bo",
      "oo...oo..oo...oo",
    ],
    rig: {
      parts: { wingL: [0, 0, 5, 16], wingR: [11, 0, 5, 16] },
      fx: {
        feelers: [
          [4, 2, "m"],
          [3, 1, "m"],
          [11, 2, "m"],
          [12, 1, "m"],
        ],
        scale: [[16, 6, "b"]],
      },
    },
  },
  {
    id: "dawnmolt",
    name: "Dawnmolt",
    blurb:
      "Grew out of a Duskmolt. Its last dark scale fell, and now it sheds light instead.",
    colors: { o: OUTLINE, w: SHINE, b: "#d6cfe6", m: "#f0c75e", l: "#fff3c4" },
    sprite: [
      "o.....m....m.....o",
      "oo...om....mo...oo",
      "obo..omo..omo..obo",
      "obmo..omoomo..ombo",
      "obmboooooooooobmbo",
      "olbbmobbbbbbombblo",
      "ombmmoowoowoommbmo",
      "ombmlobbbbbbolmbmo",
      "ombmmoobbbboommbmo",
      "ombmmooobbooommbmo",
      "ombmmobbmmbbommbmo",
      "ombmmobbllbbommbmo",
      "ombmmomllllmommbmo",
      "oboboobbllbboobobo",
      "obo.oobbmmbboo.obo",
      "obo..oobbbboo..obo",
      "obo..obo..obo..obo",
      "ooo..oo....oo..ooo",
    ],
    rig: {
      parts: { wingL: [0, 0, 5, 18], wingR: [13, 0, 5, 18] },
      fx: {
        moteA: [
          [2, 1, "m"],
          [15, 1, "m"],
        ],
        moteB: [
          [4, 2, "m"],
          [13, 2, "m"],
        ],
      },
    },
  },
];

export default line;
