/**
 * The creature corpus. See DESIGN.md §5.5. Every sprite is original and drawn
 * here; art from elsewhere ships only with a licence that allows it, and never
 * a character someone else owns.
 *
 * Order is discovery order and dex number: the Nth good week finds creature
 * #N. Each evolution line has a folder, base form first, with its idle loops
 * beside it in `idle.css`; this list is the only place the lines are ordered.
 */

import type { Creature } from "@/lib/types";
import sproutle from "./sproutle";
import emberpup from "./emberpup";
import drizzlet from "./drizzlet";
import mossback from "./mossback";
import gustling from "./gustling";
import pebblit from "./pebblit";
import glimmoth from "./glimmoth";
import frostnib from "./frostnib";
import duskmolt from "./duskmolt";
import stonkey from "./stonkey";
import spurling from "./spurling";
import gainlet from "./gainlet";
import tangling from "./tangling";

export { default as COGLINGS } from "./cogling";

export const CREATURES: Creature[] = [
  ...sproutle,
  ...emberpup,
  ...drizzlet,
  ...mossback,
  ...gustling,
  ...pebblit,
  ...glimmoth,
  ...frostnib,
  ...duskmolt,
  ...stonkey,
  ...spurling,
  ...gainlet,
  ...tangling,
];
