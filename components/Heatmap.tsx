"use client";

import { useMemo, useState } from "react";
import { LEVEL_LABEL, levelColor, type Ramp } from "@/lib/colors";
import { formatDayFull, formatMonthShort, weekdayInitials } from "@/lib/dates";
import type { DayStat } from "@/lib/history";
import type { DayKey } from "@/lib/types";
import { useMediaQuery, WIDE } from "@/lib/use-media-query";

/**
 * The contribution grid. See DESIGN.md §4. One `<svg>`, one delegated listener
 * and a single tab stop with a virtual cursor, not 371 components with 371
 * handlers. Below 640px it transposes and flows vertically, a horizontally
 * scrolling year strip on a phone trapping vertical scroll.
 */

const H = { cell: 11, gap: 3, padTop: 18, padLeft: 26 };
const V = { cell: 18, gap: 5, padTop: 20, padLeft: 30 };

export function Heatmap({
  stats,
  weekStartsOn,
  today,
  selected,
  onSelect,
  ramp = "neutral",
  label = "Habit completion by day",
}: {
  /** Ascending, whole weeks, beginning on the user's week start. */
  stats: DayStat[];
  weekStartsOn: 0 | 1;
  today: DayKey;
  selected: DayKey | null;
  onSelect: (date: DayKey | null) => void;
  ramp?: Ramp;
  label?: string;
}) {
  const horizontal = useMediaQuery(WIDE);
  const [cursor, setCursor] = useState<number | null>(null);

  const weeks = useMemo(() => chunk(stats, 7), [stats]);
  const initials = weekdayInitials(weekStartsOn);

  const geo = horizontal ? H : V;
  const step = geo.cell + geo.gap;
  const width = horizontal
    ? geo.padLeft + weeks.length * step - geo.gap
    : geo.padLeft + 7 * step - geo.gap;
  const height = horizontal
    ? geo.padTop + 7 * step - geo.gap
    : geo.padTop + weeks.length * step - geo.gap;

  function position(index: number) {
    const week = Math.floor(index / 7);
    const day = index % 7;
    return horizontal
      ? { x: geo.padLeft + week * step, y: geo.padTop + day * step }
      : { x: geo.padLeft + day * step, y: geo.padTop + week * step };
  }

  // First week of each month, with breathing room so short ones do not collide.
  const monthLabels = useMemo(() => {
    const out: { key: string; label: string; index: number }[] = [];
    let previous = "";
    let lastIndex = -3;
    weeks.forEach((week, index) => {
      const month = week[0].date.slice(0, 7);
      if (month !== previous && index - lastIndex >= 3) {
        out.push({ key: month, label: formatMonthShort(week[0].date), index });
        lastIndex = index;
      }
      previous = month;
    });
    return out;
  }, [weeks]);

  function move(delta: number) {
    setCursor((current) => {
      const start = current ?? stats.findIndex((s) => s.date === today);
      const next = Math.min(stats.length - 1, Math.max(0, start + delta));
      return next;
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Transposed, the arrows keep their spatial meaning: left/right a day,
    // up/down a week.
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    };

    if (event.key in map) {
      event.preventDefault();
      move(map[event.key]);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setCursor(stats.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const index = cursor ?? stats.findIndex((s) => s.date === today);
      const stat = stats[index];
      if (stat && !stat.preStart)
        onSelect(stat.date === selected ? null : stat.date);
    }
  }

  function onClick(event: React.MouseEvent) {
    const date = (event.target as SVGElement).dataset?.date;
    if (!date) return;
    const stat = stats.find((s) => s.date === date);
    if (!stat || stat.preStart) return;
    setCursor(stats.indexOf(stat));
    onSelect(date === selected ? null : date);
  }

  const cursorStat = cursor === null ? null : stats[cursor];

  return (
    <div className={horizontal ? "" : "flex justify-center"}>
      <svg
        role="grid"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={onClick}
        aria-activedescendant={cursorStat ? `hm-${cursorStat.date}` : undefined}
        viewBox={`0 0 ${width} ${height}`}
        width={horizontal ? "100%" : width}
        height={horizontal ? undefined : height}
        style={horizontal ? { height: "auto" } : undefined}
        className="max-w-full overflow-visible rounded-sm"
      >
        {monthLabels.map(({ key, label, index }) => (
          <text
            key={key}
            x={horizontal ? geo.padLeft + index * step : 0}
            y={horizontal ? 10 : geo.padTop + index * step + geo.cell - 4}
            className="fill-muted"
            style={{ fontSize: 9 }}
          >
            {label}
          </text>
        ))}

        {initials.map((initial, i) =>
          // Horizontal shows alternating rows only; the full gutter crowds.
          horizontal && i % 2 === 0 ? null : (
            <text
              key={`${initial}-${i}`}
              x={horizontal ? 0 : geo.padLeft + i * step + geo.cell / 2}
              y={horizontal ? geo.padTop + i * step + geo.cell - 1 : 10}
              textAnchor={horizontal ? "start" : "middle"}
              className="fill-muted"
              style={{ fontSize: 9 }}
            >
              {initial}
            </text>
          ),
        )}

        {weeks.map((week, w) => (
          <g role="row" key={week[0].date}>
            {week.map((stat, d) => {
              const index = w * 7 + d;
              const { x, y } = position(index);
              const isFuture = stat.date > today;
              const isRest = stat.level === "rest";

              return (
                <rect
                  key={stat.date}
                  id={`hm-${stat.date}`}
                  role="gridcell"
                  data-date={stat.date}
                  x={x}
                  y={y}
                  width={geo.cell}
                  height={geo.cell}
                  rx={2}
                  fill={levelColor(stat.level, ramp)}
                  stroke={isRest ? "var(--border)" : "none"}
                  strokeWidth={isRest ? 1 : 0}
                  opacity={isFuture ? 0.35 : 1}
                  aria-label={labelFor(stat, isFuture)}
                  aria-selected={stat.date === selected}
                  className={stat.preStart || isFuture ? "" : "cursor-pointer"}
                />
              );
            })}
          </g>
        ))}

        {/* Selection and keyboard cursor rings, drawn last so they sit on top. */}
        {[selected, cursorStat?.date].map((date, i) =>
          date ? (
            <Ring
              key={`${i}-${date}`}
              index={stats.findIndex((s) => s.date === date)}
              position={position}
              size={geo.cell}
              color={i === 0 ? "var(--foreground)" : "var(--ring)"}
            />
          ) : null,
        )}
      </svg>
    </div>
  );
}

function Ring({
  index,
  position,
  size,
  color,
}: {
  index: number;
  position: (index: number) => { x: number; y: number };
  size: number;
  color: string;
}) {
  if (index < 0) return null;
  const { x, y } = position(index);
  return (
    <rect
      x={x - 1.5}
      y={y - 1.5}
      width={size + 3}
      height={size + 3}
      rx={3}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      pointerEvents="none"
    />
  );
}

export function HeatmapLegend({ ramp = "neutral" }: { ramp?: Ramp }) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted">
      <span>Less</span>
      {([0, 1, 2, 3, 4] as const).map((level) => (
        <span
          key={level}
          className="h-2.75 w-2.75 rounded-xs"
          style={{ background: levelColor(level, ramp) }}
        />
      ))}
      <span>More</span>
    </div>
  );
}

function labelFor(stat: DayStat, isFuture: boolean): string {
  const date = formatDayFull(stat.date);
  if (isFuture) return `${date}: upcoming`;
  if (stat.preStart) return `${date}: before you started`;
  if (stat.score === null) return `${date}: ${LEVEL_LABEL.rest}`;
  return `${date}: ${stat.completed} of ${stat.scheduled} habits completed`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
