"use client";

/**
 * Haptic confirmation for a tick. See DESIGN.md §6.4 — on a phone the thumb
 * covers the target it just pressed. The patterns are **short**, a tick being
 * an acknowledgement rather than an alert, and completion is *structurally*
 * different from a step towards it: a gap reads through a pocket where 12ms
 * against 20ms does not. Not gated on `prefers-reduced-motion`, which is about
 * visual motion; `settings.haptics` is the only authority.
 */

/** One step towards the target. */
export const HAPTIC_TICK = 12;

/** Target reached. The gap is what makes it recognisable, not the length. */
export const HAPTIC_DONE = [12, 45, 26];

/**
 * Decoration by construction — the tick is recorded before this runs, and iOS
 * never supports it. The try/catch covers browsers that expose the method and
 * reject the call for want of user activation or a permissions policy.
 */
export function vibrate(pattern: VibratePattern): void {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  )
    return;

  try {
    navigator.vibrate(pattern);
  } catch {
    // A tick is not worth an exception.
  }
}
