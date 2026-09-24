/**
 * WCAG 2.1 contrast. See DESIGN.md §6.6. The shipped skins were measured by
 * hand at author time; a custom palette has no author, so the same arithmetic
 * runs while the user types. 2.1 rather than APCA, because the rest of the
 * codebase is held to 4.5:1 and two scales cannot be compared.
 */

import { parseHex, type Rgb } from "./oklch";

/** AA for normal text. */
export const AA_TEXT = 4.5;
/** AA for UI components and focus indicators — WCAG 2.1 SC 1.4.11. */
export const AA_NON_TEXT = 3;

function channel(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Null when either side is not a hex we can measure. */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseHex(a);
  const second = parseHex(b);
  if (first === null || second === null) return null;

  const one = relativeLuminance(first);
  const two = relativeLuminance(second);
  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/** One decimal place, the resolution the audit panel reports. */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 10) / 10}:1`;
}
