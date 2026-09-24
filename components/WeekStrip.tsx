"use client";

import { useState } from "react";
import { useBrowseDay } from "@/components/BrowseDay";
import {
  addDays,
  daysBetween,
  formatDayLong,
  formatWeekRange,
  parseDayKey,
  startOfWeek,
  weekdayInitials,
} from "@/lib/dates";
import { useOpenHabits } from "@/lib/store";
import type { DayKey } from "@/lib/types";
import { useHorizontalDrag } from "@/lib/use-drag";
import { useToday } from "@/lib/use-today";

/**
 * The browsed day's week, one circle per day. It follows the browsed day rather
 * than today, and its own arrows and drag move a whole week where the list's
 * swipe moves a day — the two sit in different slots, so no gesture is
 * contested. The range above the circles is there because a gesture can change
 * the week without the user meaning to look.
 *
 * It is the one element that takes the touch axes from the browser: nothing
 * inside it scrolls sideways, so §6.8's objection does not reach it, and
 * without the claim a downward drift cancels the pointer. `pinch-zoom` rather
 * than `pan-x pinch-zoom`, since `pan-x` is taken as soon as a gesture is
 * plainly horizontal — which is every drag this row exists for.
 *
 * It is also the one surface that follows the finger (`lib/use-drag.ts`) and
 * accepts a mouse drag. A drag carries the neighbouring weeks in with it,
 * mounted only while one is in progress; an abandoned drag springs back, a
 * committed one slides the neighbour into place and only then changes the day.
 * A week that turns over any other way still gets the fade-and-slide, its
 * direction taken from comparing the weeks rather than from a handler.
 */
export function WeekStrip() {
  const { hydrated, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const { offset, setOffset } = useBrowseDay();

  // A committed drag animates first and moves the day when that finishes, so
  // the week never changes under a row in motion.
  const [settling, setSettling] = useState<"next" | "prev" | null>(null);
  const drag = useHorizontalDrag((direction) =>
    setSettling(direction === "left" ? "next" : "prev"),
  );

  const start =
    hydrated && today
      ? startOfWeek(addDays(today, offset), settings.weekStartsOn)
      : null;

  // During render rather than in an effect, or the arriving week is painted
  // once at rest before it slides. A `DayKey` sorts as a date.
  const [shown, setShown] = useState(start);
  const [turn, setTurn] = useState<"next" | "prev" | null>(null);
  if (shown !== start) {
    // A settled drag has already shown the week arriving; anything else — an
    // arrow, a circle, the list crossing a boundary — still gets the slide.
    setTurn(
      settling || !shown || !start ? null : start > shown ? "next" : "prev",
    );
    setShown(start);
    // Whatever changed the week ended the settle: the row is remounted at rest
    // and the transition that would have finished it never fires.
    setSettling(null);
  }

  // Putting the animation class back restarts it, so a week turned over by the
  // list and then dragged would replay a slide it already played. Spending the
  // turn when the drag claims the row is what stops that.
  if (drag.dragging && turn !== null) setTurn(null);

  // Same height as the real strip, so hydration does not push the page down.
  if (!hydrated || !today || !start) {
    return <div aria-hidden="true" className="h-22" />;
  }

  const day = addDays(today, offset);
  const turning =
    turn === "next"
      ? "animate-week-next"
      : turn === "prev"
        ? "animate-week-prev"
        : "";
  const initials = weekdayInitials(settings.weekStartsOn);
  const thisWeek = start === startOfWeek(today, settings.weekStartsOn);

  const moving = drag.dragging || settling !== null;
  // A week away is one row width plus the gutter — the same 0.5rem as the
  // `pr-2`/`pl-2` holding the neighbours off the row on screen.
  const transform = drag.dragging
    ? `translateX(${drag.dx}px)`
    : settling === "next"
      ? "translateX(calc(-100% - 0.5rem))"
      : settling === "prev"
        ? "translateX(calc(100% + 0.5rem))"
        : undefined;

  return (
    <nav
      aria-label="Week"
      className="touch-pinch-zoom select-none"
      // A new gesture would replace the transform mid-transition, and the week
      // would never change hands.
      {...(settling ? {} : drag.handlers)}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <p
          aria-live="polite"
          className="font-mono text-[12px] tabular-nums text-muted"
        >
          {formatWeekRange(start)}
        </p>
        {!thisWeek && (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="h-6 rounded-control px-2 text-[12px] text-muted transition-colors hover:text-foreground"
          >
            This week
          </button>
        )}
      </div>
      <div className="mt-2 flex items-end gap-1">
        <WeekButton label="Previous week" onClick={() => setOffset(offset - 7)}>
          ‹
        </WeekButton>
        {/* `clip` rather than `hidden`: a dragged row must not reach past the
          arrows, and `hidden` would make this a scroll container — which the
          drag hook reads as a surface that scrolls sideways on its own. The
          padding, pulled back by an equal negative margin, is what keeps a
          circle's focus ring out of the clip at either end — `clip` on one
          axis makes the browser ignore `overflow-clip-margin`. */}
        <div className="-mx-1 min-w-0 flex-1 overflow-x-clip px-1">
          {/* Keyed on the week so the arriving row mounts at rest: without that
            the settle's transform would transition back to nothing on the
            handover, and the week would slide in and then straight back out. */}
          <div
            key={start}
            style={{ transform }}
            onTransitionEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.propertyName !== "transform" || !settling) return;
              setOffset((o) => o + (settling === "next" ? 7 : -7));
            }}
            className={`relative ${drag.dragging ? "" : "transition-week"}`}
          >
            {/* Mounted only for the length of a gesture, and outside the clip:
              hidden from the accessibility tree and inert, because a drag is
              not how a screen reader or a keyboard reaches another week. */}
            {moving && (
              <>
                <div
                  aria-hidden="true"
                  inert
                  className="absolute inset-y-0 right-full w-full pr-2"
                >
                  <WeekRow
                    start={addDays(start, -7)}
                    today={today}
                    day={day}
                    initials={initials}
                    onSelect={setOffset}
                  />
                </div>
                <div
                  aria-hidden="true"
                  inert
                  className="absolute inset-y-0 left-full w-full pl-2"
                >
                  <WeekRow
                    start={addDays(start, 7)}
                    today={today}
                    day={day}
                    initials={initials}
                    onSelect={setOffset}
                  />
                </div>
              </>
            )}
            <WeekRow
              className={drag.dragging ? "" : turning}
              start={start}
              today={today}
              day={day}
              initials={initials}
              onSelect={setOffset}
            />
          </div>
        </div>
        <WeekButton label="Next week" onClick={() => setOffset(offset + 7)}>
          ›
        </WeekButton>
      </div>
    </nav>
  );
}

function WeekRow({
  start,
  today,
  day,
  initials,
  onSelect,
  className = "",
}: {
  start: DayKey;
  today: DayKey;
  day: DayKey;
  initials: string[];
  onSelect: (offset: number) => void;
  className?: string;
}) {
  return (
    <ol className={`grid grid-cols-7 gap-1 ${className}`}>
      {initials.map((initial, i) => {
        const key = addDays(start, i);
        const selected = key === day;
        const isToday = key === today;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(daysBetween(today, key))}
              aria-label={formatDayLong(key)}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              className="group flex w-full flex-col items-center gap-1"
            >
              <span
                aria-hidden="true"
                className={`text-[11px] leading-4 font-semibold ${
                  selected || isToday ? "text-foreground" : "text-muted"
                }`}
              >
                {initial}
              </span>
              <span
                aria-hidden="true"
                className={`flex aspect-square w-full max-w-9 items-center justify-center rounded-full border font-mono text-[13px] tabular-nums transition-colors ${
                  selected
                    ? "border-accent bg-accent text-accent-fg"
                    : isToday
                      ? "border-accent text-foreground group-hover:bg-surface-2"
                      : "border-border text-foreground group-hover:bg-surface-2"
                }`}
              >
                {parseDayKey(key).d}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function WeekButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-7 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}
