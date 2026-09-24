/**
 * The creature corpus. See DESIGN.md §5.5. Every sprite is original and drawn
 * here; art from elsewhere ships only with a licence that allows it, and never
 * a character someone else owns.
 *
 * Order is discovery order: the Nth good week finds the Nth creature.
 */

import type { Creature, Pixel } from "@/lib/types";

const OUTLINE = "#2a2433";
const SHINE = "#ffffff";

export const CREATURES: Creature[] = [
  {
    id: "sproutle",
    name: "Sproutle",
    blurb: "Grows one leaf for every morning it is watered. Never skips one.",
    colors: { o: OUTLINE, w: SHINE, b: "#7cc26b", l: "#3f9b4a", d: "#5aa9e6" },
    sprite: [
      "......ll....",
      ".....lll....",
      "......o.....",
      "...oooooo...",
      "..obbbbbbo..",
      ".obbbbbbbbo.",
      ".obwobbwobo.",
      ".obbbbbbbbo.",
      ".obbboobbbo.",
      "..obbbbbbo..",
      "...oo..oo...",
      "............",
    ],
    rig: {
      parts: { leaf: [5, 0, 3, 2] },
      fx: { drop: [[6, -2, "d"]] },
    },
  },
  {
    id: "emberpup",
    name: "Emberpup",
    blurb: "Its tail glows warmer the longer its streak runs.",
    colors: { o: OUTLINE, w: SHINE, b: "#f08a4b", l: "#ffd8a8" },
    sprite: [
      ".o........o.",
      ".oo......oo.",
      ".obo....obo.",
      ".obboooobbo.",
      ".obbbbbbbbo.",
      "obwobbbbwobo",
      "obbbbllbbbbo",
      ".obbbllbbbo.",
      "..obbbbbbo..",
      "..obo..obo..",
      "..oo....oo..",
      "............",
    ],
    rig: {
      parts: { earL: [1, 0, 1, 1], earR: [10, 0, 1, 1] },
      fx: { spark: [[5, 2, "b"]] },
    },
  },
  {
    id: "drizzlet",
    name: "Drizzlet",
    blurb: "Falls as one drop a day. Given a year, it becomes a lake.",
    colors: { o: OUTLINE, w: SHINE, b: "#5aa9e6", l: "#bfe3ff" },
    sprite: [
      ".....oo.....",
      "....obbo....",
      "....obbo....",
      "...obbbbo...",
      "..obbbbbbo..",
      ".oblbbbbbbo.",
      ".olbwobwobo.",
      ".olbbbbbbbo.",
      ".obbbooobbo.",
      "..obbbbbbo..",
      "...oooooo...",
      "............",
    ],
    rig: {
      parts: { tip: [4, 0, 4, 3] },
      fx: {
        drop: [[6, 11, "b"]],
        puddle: [3, 4, 5, 6, 7, 8].map((x): Pixel => [x, 12, "b"]),
      },
    },
  },
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
    id: "pebblit",
    name: "Pebblit",
    blurb: "Made of every small thing it ever did twice.",
    colors: { o: OUTLINE, w: SHINE, b: "#9a9aa6", l: "#c8c8d2" },
    sprite: [
      "............",
      "............",
      "...oooooo...",
      "..obblbbbo..",
      ".obbbbbbbbo.",
      ".obwobbwobo.",
      "oobbbbbbbboo",
      "obobbbbbbobo",
      "oo.obbbbo.oo",
      "...obbbbo...",
      "...oo..oo...",
      "............",
    ],
    rig: {
      parts: { armL: [0, 6, 2, 3], armR: [10, 6, 2, 3] },
      fx: {
        dust: [
          [2, 10, "b"],
          [9, 10, "b"],
        ],
      },
    },
  },
  {
    id: "glimmoth",
    name: "Glimmoth",
    blurb:
      "Only comes out after a day you finished. Nobody knows how it knows.",
    colors: { o: OUTLINE, w: "#f7e27a", b: "#9b7fd4", l: "#4a3a6b" },
    sprite: [
      "............",
      ".oo......oo.",
      "obbo.oo.obbo",
      "obbbollobbbo",
      "obwbollobwbo",
      "obbbollobbbo",
      ".obbollobbo.",
      ".obbollobbo.",
      "..oboollobo.",
      ".....oo.....",
      "............",
      "............",
    ],
    rig: {
      parts: { wingL: [0, 1, 4, 8], wingR: [8, 1, 4, 8] },
      fx: {
        glint: [[10, 10, "w"]],
        rays: [
          [9, 10, "w"],
          [11, 10, "w"],
          [10, 9, "w"],
          [10, 11, "w"],
        ],
      },
    },
  },
  {
    id: "frostnib",
    name: "Frostnib",
    blurb: "Takes a cold swim every day, and says it feels great afterwards.",
    colors: { o: OUTLINE, w: SHINE, b: "#3d5a80", l: "#eef4fa", d: "#7fc8f8" },
    sprite: [
      "....oooo....",
      "...obbbbo...",
      "..obwobwobo.",
      "..obbllbbo..",
      ".obbllllbbo.",
      "obbllllllbbo",
      "obbllllllbbo",
      ".obllllllbo.",
      ".obllllllbo.",
      "..obbbbbbo..",
      "..oooooooo..",
      "...ll..ll...",
    ],
    rig: {
      parts: {
        body: [0, 0, 12, 11],
        footL: [3, 11, 2, 1],
        footR: [7, 11, 2, 1],
      },
      fx: {
        spray1: [
          [0, 4, "d"],
          [11, 4, "d"],
        ],
        spray2: [
          [-1, 2, "d"],
          [12, 2, "d"],
        ],
      },
    },
  },
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
];
