"use client";

import { habitColor, levelColor } from "@/lib/colors";
import type { DayStat, HabitDayState } from "@/lib/history";
import { toggleEntry } from "@/lib/store";
import type { DayKey } from "@/lib/types";

/**
 * The tick target, in one shape per skin (§6.5) and one file, because what must
 * never differ between them is the mutation: all three go through the same
 * `TickTarget`, where the whole control is the button, 44px on its shortest
 * side, and the write is synchronous.
 *
 * `readOnly` is the only thing that disables it, and never for waiting — a day
 * that has not happened cannot be ticked (§6.8). `onEdit` swaps what the press
 * does rather than adding a second target (§6.10), and outranks `readOnly`,
 * because a future day's habits are still the user's to change.
 */

function TickTarget({
  state,
  day,
  readOnly = false,
  onEdit,
  className,
  children,
}: {
  state: HabitDayState;
  day: DayKey;
  readOnly?: boolean;
  onEdit?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;

  if (onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        data-habit-id={habit.id}
        aria-label={`Edit ${habit.name}`}
        className={`${className} relative after:pointer-events-none after:absolute after:inset-1 after:rounded-[inherit] after:border after:border-dashed after:border-current after:opacity-30 after:content-['']`}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => toggleEntry(habit.id, day)}
      data-habit-id={habit.id}
      aria-pressed={done}
      aria-label={
        counted
          ? `${habit.name}: ${count} of ${habit.target} done`
          : `${habit.name}${done ? ", done" : ", not done"}`
      }
      className={`${className} disabled:cursor-default`}
    >
      {children}
    </button>
  );
}

/** Remounting on count change replays the pop — DESIGN.md §6.3. */
function Checkbox({
  count,
  done,
  accent,
  size = 28,
}: {
  count: number;
  done: boolean;
  accent: string;
  size?: number;
}) {
  return (
    <span
      key={count}
      aria-hidden="true"
      className="animate-pop flex shrink-0 items-center justify-center rounded-md border-2 transition-colors"
      style={{
        width: size,
        height: size,
        borderColor: done ? accent : "var(--border)",
        background: done ? accent : "transparent",
      }}
    >
      {done && (
        <svg
          width={size * 0.54}
          height={size * 0.54}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

/** The checkbox goes rather than sits beside it: a tick state reads as tickable. */
function EditMark({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
      }}
    >
      <svg
        width={size * 0.54}
        height={size * 0.54}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </span>
  );
}

/** `classic` — emoji, name, checkbox, and a progress hairline when counted. */
export function HabitRow({
  state,
  day,
  readOnly = false,
  dimmed = false,
  onEdit,
}: {
  state: HabitDayState;
  day: DayKey;
  readOnly?: boolean;
  dimmed?: boolean;
  onEdit?: () => void;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;
  const accent = habitColor(habit.color);

  return (
    <TickTarget
      state={state}
      day={day}
      readOnly={readOnly}
      onEdit={onEdit}
      className={`flex min-h-14 w-full items-center gap-3 rounded-control px-3 text-left transition-colors hover:bg-surface-2 ${
        dimmed ? "opacity-55" : ""
      }`}
    >
      <span aria-hidden="true" className="w-6 shrink-0 text-center text-lg">
        {habit.emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[15px] ${
            done ? "text-muted line-through decoration-1" : "text-foreground"
          }`}
        >
          {habit.name}
        </span>
        {counted && (
          <span className="mt-1 block h-1 w-full max-w-35 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.min(100, (count / habit.target) * 100)}%`,
                background: accent,
              }}
            />
          </span>
        )}
      </span>

      {counted && (
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted">
          {count}/{habit.target}
        </span>
      )}

      {onEdit ? (
        <EditMark color="var(--accent)" />
      ) : (
        <Checkbox count={count} done={done} accent={accent} />
      )}
    </TickTarget>
  );
}

/**
 * `grid` — the same row with its own last-14-days strip and streak, both
 * optional so a caller need not compute them. The emoji goes: in a dense
 * column the colour bar identifies the habit faster than a glyph.
 */
export function HabitRowDense({
  state,
  day,
  trail,
  streak,
  readOnly = false,
  dimmed = false,
  onEdit,
}: {
  state: HabitDayState;
  day: DayKey;
  trail?: DayStat[];
  streak?: number;
  readOnly?: boolean;
  dimmed?: boolean;
  onEdit?: () => void;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;
  const accent = habitColor(habit.color);

  return (
    <TickTarget
      state={state}
      day={day}
      readOnly={readOnly}
      onEdit={onEdit}
      className={`flex min-h-13 w-full items-center gap-2.5 rounded-control px-3 text-left transition-colors hover:bg-surface-2 ${
        dimmed ? "opacity-55" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="h-6 w-0.75 shrink-0 rounded-full"
        style={{ background: accent }}
      />

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[14px] ${
            done ? "text-muted line-through decoration-1" : "text-foreground"
          }`}
        >
          {habit.name}
        </span>
        {trail && trail.length > 0 && (
          <span aria-hidden="true" className="mt-1.5 flex gap-0.5">
            {trail.map((stat) => (
              <span
                key={stat.date}
                className="h-2 w-2 rounded-cell"
                style={{
                  background:
                    stat.level === "rest"
                      ? "var(--surface-2)"
                      : levelColor(stat.level, habit.color),
                }}
              />
            ))}
          </span>
        )}
      </span>

      {streak !== undefined && streak > 0 && (
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted">
          {streak}d
        </span>
      )}

      {counted && (
        <span className="w-10 shrink-0 text-right font-mono text-[12px] tabular-nums text-foreground">
          {count}/{habit.target}
        </span>
      )}

      {onEdit ? (
        <EditMark color="var(--accent)" />
      ) : (
        <Checkbox count={count} done={done} accent={accent} />
      )}
    </TickTarget>
  );
}

/** Segments a counted habit into `target` marks, up to where they stay hittable. */
const MAX_SEGMENTS = 8;

/**
 * `blocks` — a tile you hit rather than a line you tick. A done tile flips to
 * `--accent-2` wholesale, which is what carries at arm's length, and the
 * habit's colour rides a bar so identity survives the flip — filling the tile
 * would put text on a colour nobody validated it against.
 */
export function HabitTile({
  state,
  day,
  streak,
  readOnly = false,
  dimmed = false,
  onEdit,
}: {
  state: HabitDayState;
  day: DayKey;
  streak?: number;
  readOnly?: boolean;
  dimmed?: boolean;
  onEdit?: () => void;
}) {
  const { habit, count, done } = state;
  const counted = habit.target > 1;
  const accent = habitColor(habit.color);

  return (
    <TickTarget
      state={state}
      day={day}
      readOnly={readOnly}
      onEdit={onEdit}
      className={`surface-card flex h-full min-h-32 w-full flex-col justify-between gap-2 p-3 text-left transition-colors ${
        done ? "bg-accent-2 text-accent-2-fg" : "bg-surface text-foreground"
      } ${dimmed ? "opacity-55" : ""}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span aria-hidden="true" className="text-[26px] leading-none">
          {habit.emoji}
        </span>
        {counted && (
          <span className="display-type shrink-0 text-[15px] tabular-nums">
            {count}/{habit.target}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className="block h-0.75 w-full shrink-0"
        style={{ background: accent }}
      />

      <span className="block">
        <span className="display-type block text-[14px] leading-[1.1] text-balance">
          {habit.name}
        </span>

        <span className="mt-2 flex items-center justify-between gap-2">
          {counted ? (
            <Segments count={count} target={habit.target} accent={accent} />
          ) : (
            <span className="text-[11px] font-bold tracking-[0.06em] uppercase">
              {streak !== undefined && streak > 0
                ? `${streak} days`
                : "Not yet"}
            </span>
          )}
          {/* A done tile is filled with --accent-2, which the accent would
              vanish into; the tile's own text colour is what was checked
              against that fill. */}
          {onEdit ? (
            <EditMark color={done ? "currentColor" : "var(--accent)"} />
          ) : (
            !counted && (
              <Checkbox count={count} done={done} accent={accent} size={28} />
            )
          )}
        </span>
      </span>
    </TickTarget>
  );
}

function Segments({
  count,
  target,
  accent,
}: {
  count: number;
  target: number;
  accent: string;
}) {
  if (target > MAX_SEGMENTS) {
    return (
      <span className="block h-2.5 w-full border-2 border-border">
        <span
          className="block h-full"
          style={{
            width: `${Math.min(100, (count / target) * 100)}%`,
            background: accent,
          }}
        />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="flex w-full gap-1">
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1 border-2 border-border"
          style={{ background: i < count ? accent : "transparent" }}
        />
      ))}
    </span>
  );
}
