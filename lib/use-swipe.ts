"use client";

/**
 * Horizontal swipe as day/week navigation. See DESIGN.md §6.8. The decision is
 * a pure function because every hard part is a threshold: a thumb scrolling a
 * list drifts sideways by tens of pixels without meaning anything by it.
 */

import { useRef } from "react";

export type SwipeDirection = "left" | "right";

/** Below this the gesture is a tap, and a tap on a habit must still tick it. */
export const MIN_DISTANCE = 40;

/** How far off the horizontal a swipe may wander, as a fraction of its length. */
export const MAX_OFF_AXIS = 0.6;

/** A slow drag is a scroll that changed its mind, not a flick. */
const MAX_DURATION_MS = 800;

/**
 * `dt` is omitted by a gesture the surface followed (`use-drag.ts`), where a
 * slow drag is someone taking their time over something they can see moving.
 * An argument rather than a second copy of the other two thresholds.
 */
export function resolveSwipe(
  dx: number,
  dy: number,
  dt?: number,
): SwipeDirection | null {
  if (dt !== undefined && dt > MAX_DURATION_MS) return null;
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS) return null;
  return dx < 0 ? "left" : "right";
}

/**
 * The gesture yields to any horizontal scroller between the press and the
 * container — the week grid is one, and dragging it must scroll it. It is also
 * why the hook sets no `touch-action`: `pan-y` on the container would take an
 * axis a descendant cannot get back. A surface holding no scroller may claim
 * one itself, as `WeekStrip` does.
 */
export function insideHorizontalScroller(
  target: EventTarget | null,
  container: Element,
): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== container) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Touch and pen only: on a desktop a horizontal drag is a text selection, and
 * the arrow buttons are the answer there — which is also what keeps this
 * reachable from a keyboard and a screen reader, neither of which hears a swipe.
 */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const from = useRef<{ x: number; y: number; t: number; id: number } | null>(
    null,
  );
  const swiped = useRef(false);

  return {
    onPointerDown(event: React.PointerEvent) {
      swiped.current = false;
      if (
        event.pointerType === "mouse" ||
        !event.isPrimary ||
        insideHorizontalScroller(event.target, event.currentTarget)
      ) {
        from.current = null;
        return;
      }
      from.current = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
        id: event.pointerId,
      };
    },

    // Touch pointers are implicitly captured, so the release bubbles here even
    // if the thumb has left the row it started on.
    onPointerUp(event: React.PointerEvent) {
      const start = from.current;
      from.current = null;
      if (!start || start.id !== event.pointerId) return;

      const direction = resolveSwipe(
        event.clientX - start.x,
        event.clientY - start.y,
        event.timeStamp - start.t,
      );
      if (!direction) return;

      swiped.current = true;
      onSwipe(direction);
    },

    onPointerCancel() {
      from.current = null;
    },

    /**
     * A swipe that began on a tick target still ends in a click; swallowing it
     * here is what keeps a swipe from ticking a habit off on the way past.
     */
    onClickCapture(event: React.MouseEvent) {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
