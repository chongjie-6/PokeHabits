import type { Pixel } from "@/lib/types";

export const OUTLINE = "#2a2433";
export const SHINE = "#ffffff";

/** Effect pixels drawn like a sprite, with the top-left pixel at `[x, y]`. */
export function pixelsAt(x: number, y: number, rows: string[]): Pixel[] {
  return rows.flatMap((row, dy) =>
    [...row].flatMap((key, dx): Pixel[] =>
      key === "." ? [] : [[x + dx, y + dy, key]],
    ),
  );
}
