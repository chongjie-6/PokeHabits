"use client";

/**
 * A horizontal drag the surface follows while it happens (§6.8), where
 * `use-swipe.ts` reads the gesture only on release. Right for the day list,
 * whose content is its own feedback; wrong for the week strip, where only the
 * numerals change. Following the finger is what makes it abandonable. The
 * thresholds are imported rather than restated.
 */

import { useRef, useState } from "react";
import {
  insideHorizontalScroller,
  MAX_OFF_AXIS,
  MIN_DISTANCE,
  resolveSwipe,
  type SwipeDirection,
} from "@/lib/use-swipe";

/**
 * Under this the gesture is still a tap, and still a page scroll waiting to
 * happen. Well under `MIN_DISTANCE`, or the row jumps to catch the finger up.
 */
const AXIS_LOCK = 8;

/** The furthest the row may travel, however far the finger goes. */
const MAX_TRAVEL = 96;

/**
 * One-to-one until the gesture would commit, then asymptotic to `MAX_TRAVEL`.
 * The cap is feel, not layout: a row keeping pace across a whole screen reads
 * as something that can be thrown, and this one only ever moves by one step.
 */
function resist(dx: number): number {
  const past = Math.abs(dx) - MIN_DISTANCE;
  if (past <= 0) return dx;
  const give = MAX_TRAVEL - MIN_DISTANCE;
  const travel = MIN_DISTANCE + (give * past) / (past + give);
  return Math.sign(dx) * travel;
}

export function useHorizontalDrag(
  onCommit: (direction: SwipeDirection) => void,
) {
  const from = useRef<{ x: number; y: number; id: number } | null>(null);
  const locked = useRef(false);
  const dragged = useRef(false);
  const [dx, setDx] = useState(0);

  function end() {
    from.current = null;
    locked.current = false;
    setDx(0);
  }

  return {
    dx,
    // Off `dx` rather than the lock ref, which a render is not told about —
    // the axis is claimed and the row moved in the same event.
    dragging: dx !== 0,
    handlers: {
      // Unlike `useSwipe` this accepts a mouse: the strip holds nothing anyone
      // would select, and the `<nav>` turns selection off for the duration.
      onPointerDown(event: React.PointerEvent) {
        dragged.current = false;
        if (
          !event.isPrimary ||
          insideHorizontalScroller(event.target, event.currentTarget)
        ) {
          from.current = null;
          return;
        }
        from.current = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
        };
      },

      onPointerMove(event: React.PointerEvent) {
        const start = from.current;
        if (!start || start.id !== event.pointerId) return;

        const travel = event.clientX - start.x;
        const drift = event.clientY - start.y;

        if (!locked.current) {
          if (Math.abs(travel) < AXIS_LOCK) return;
          if (Math.abs(drift) > Math.abs(travel) * MAX_OFF_AXIS) {
            // Vertical: leave it to the page, which is taking the touch anyway.
            from.current = null;
            return;
          }
          locked.current = true;
          dragged.current = true;
          // Touch is captured implicitly; a mouse is not, and a drag that left
          // the row would stop reporting.
          event.currentTarget.setPointerCapture(event.pointerId);
        }

        setDx(resist(travel));
      },

      onPointerUp(event: React.PointerEvent) {
        const start = from.current;
        if (!start || start.id !== event.pointerId) return;
        const committed = locked.current;
        const travel = event.clientX - start.x;
        const drift = event.clientY - start.y;
        end();
        if (!committed) return;

        const direction = resolveSwipe(travel, drift);
        if (direction) onCommit(direction);
      },

      onPointerCancel: end,

      /**
       * A drag that began on a circle still ends in a click on it, which would
       * otherwise browse to whichever day it finished over.
       */
      onClickCapture(event: React.MouseEvent) {
        if (!dragged.current) return;
        dragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
