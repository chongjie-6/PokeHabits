"use client";

import { useState } from "react";
import { habitColor } from "@/lib/colors";
import { weekdayShortNames } from "@/lib/dates";
import { useOpenHabits } from "@/lib/store";
import {
  HABIT_COLORS,
  isHexColor,
  normaliseHabitColor,
  type Cadence,
  type HabitColor,
} from "@/lib/types";

/**
 * One form for creating and editing, because two over the same fields drift —
 * the edit screen gains a cadence option the add screen never got. No chrome of
 * its own: `HabitFormPanel` supplies one of two frames (§6.7), and the props
 * below are where they differ, both absent in the sheet.
 */

export const EMOJI = [
  "🏃",
  "📖",
  "🧘",
  "💧",
  "✍️",
  "🏋️",
  "🥗",
  "🛏️",
  "🎸",
  "🧹",
  "💊",
  "🌱",
  "🚴",
  "🧠",
  "☎️",
  "🪥",
  "🐕",
  "🧊",
];

/** Where the wheel opens when the habit is still on a palette key. */
const CUSTOM_SEED = "#7c3aed";

export type HabitFormValues = {
  name: string;
  emoji: string;
  color: HabitColor;
  cadence: Cadence;
  target: number;
};

export function HabitForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  initial?: Partial<HabitFormValues>;
  submitLabel: string;
  onSubmit: (values: HabitFormValues) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { settings } = useOpenHabits();

  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? EMOJI[0]);
  const [color, setColor] = useState<HabitColor>(initial?.color ?? "green");
  const [kind, setKind] = useState<Cadence["kind"]>(
    initial?.cadence?.kind ?? "daily",
  );
  const [days, setDays] = useState<number[]>(
    initial?.cadence?.kind === "weekdays"
      ? initial.cadence.days
      : [1, 2, 3, 4, 5],
  );
  const [times, setTimes] = useState(
    initial?.cadence?.kind === "weekly" ? initial.cadence.times : 3,
  );
  const [target, setTarget] = useState(initial?.target ?? 1);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const cadence: Cadence =
      kind === "daily"
        ? { kind: "daily" }
        : kind === "weekdays"
          ? {
              kind: "weekdays",
              days: days.length
                ? [...days].sort((a, b) => a - b)
                : [1, 2, 3, 4, 5],
            }
          : { kind: "weekly", times };

    onSubmit({ name: name.trim(), emoji, color, cadence, target });
  }

  const custom = isHexColor(color);

  // Weekday chips start from the user's chosen week start.
  const order =
    settings.weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const names = weekdayShortNames(settings.weekStartsOn);

  return (
    <form onSubmit={submit} className="space-y-4 pb-1">
      <div className="flex items-center gap-2">
        <select
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          aria-label="Icon"
          className="h-11 rounded-control border border-border bg-background px-2 text-lg"
        >
          {EMOJI.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          autoFocus={autoFocus}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Read 20 pages"
          aria-label="Habit name"
          maxLength={60}
          className="h-11 min-w-0 flex-1 rounded-control border border-border bg-background px-3 text-[15px] placeholder:text-muted"
        />
      </div>

      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {HABIT_COLORS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setColor(key)}
              aria-label={key}
              aria-pressed={color === key}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                color === key
                  ? "scale-110 border-foreground"
                  : "border-transparent"
              }`}
              style={{ background: habitColor(key) }}
            />
          ))}

          <span
            className={`relative h-8 w-8 rounded-full border-2 transition-transform ${
              custom ? "scale-110 border-foreground" : "border-transparent"
            }`}
            style={{
              // The wheel is the fallback, so it advertises itself until picked from.
              background: custom
                ? habitColor(color)
                : "conic-gradient(#e8590c, #f2c94c, #2f9e44, #0c8599, #1971c2, #6741d9, #d6336c, #e8590c)",
            }}
          >
            <input
              type="color"
              value={custom ? color : CUSTOM_SEED}
              onChange={(e) => {
                const picked = normaliseHabitColor(e.target.value);
                if (picked) setColor(picked);
              }}
              aria-label="Custom colour"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </div>
      </Field>

      <Field label="How often">
        <div className="flex gap-2">
          <Chip active={kind === "daily"} onClick={() => setKind("daily")}>
            Every day
          </Chip>
          <Chip
            active={kind === "weekdays"}
            onClick={() => setKind("weekdays")}
          >
            Certain days
          </Chip>
          <Chip active={kind === "weekly"} onClick={() => setKind("weekly")}>
            n × week
          </Chip>
        </div>

        {kind === "weekdays" && (
          <div className="mt-3 flex gap-1.5">
            {order.map((weekday, i) => {
              const on = days.includes(weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  aria-pressed={on}
                  aria-label={names[i]}
                  onClick={() =>
                    setDays((current) =>
                      current.includes(weekday)
                        ? current.filter((d) => d !== weekday)
                        : [...current, weekday],
                    )
                  }
                  className={`h-10 flex-1 rounded-control border text-[12px] font-medium ${
                    on
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border text-muted"
                  }`}
                >
                  {names[i]}
                </button>
              );
            })}
          </div>
        )}

        {kind === "weekly" && (
          <label className="mt-3 flex items-center gap-3 text-[13px] text-muted">
            <input
              type="range"
              min={1}
              max={7}
              value={times}
              onChange={(e) => setTimes(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="w-28 shrink-0 text-right font-mono tabular-nums text-foreground">
              {times}× per week
            </span>
          </label>
        )}
      </Field>

      <Field label="Times per day">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={12}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            aria-label="Times per day"
            className="flex-1 accent-accent"
          />
          <span className="w-20 shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
            {target === 1 ? "just once" : `${target}×`}
          </span>
        </div>
      </Field>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim()}
          className="h-11 flex-1 rounded-control bg-accent text-[14px] font-semibold text-accent-fg disabled:opacity-40"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-control border border-border px-4 text-[14px] text-muted"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/** "Every day" · "Mon, Wed, Fri" · "3× per week", plus the per-day target. */
export function describeCadence(
  cadence: Cadence,
  target: number,
  weekStartsOn: 0 | 1,
): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let base: string;

  switch (cadence.kind) {
    case "daily":
      base = "Every day";
      break;
    case "weekly":
      base = `${cadence.times}× per week`;
      break;
    case "weekdays": {
      const order =
        weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
      const picked = order.filter((d) => cadence.days.includes(d));
      base =
        picked.length === 7
          ? "Every day"
          : picked.length === 0
            ? "No days selected"
            : picked.map((d) => names[d]).join(", ");
      break;
    }
  }

  return target > 1 ? `${base} · ${target}× a day` : base;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 flex-1 rounded-control border px-2 text-[12px] font-medium transition-colors ${
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}
