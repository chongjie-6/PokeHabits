"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CREATURES, discoveries, QUALIFYING_RATE } from "@/lib/creatures";
import { buildHistory, firstDayOf } from "@/lib/history";
import { useOpenHabits } from "@/lib/store";
import { useToday } from "@/lib/use-today";
import type { Creature, Pixel, PixelBox } from "@/lib/types";
import "./idle.css";

export default function DexPage() {
  const { hydrated, habits, entries, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);

  const view = useMemo(() => {
    if (!hydrated || !today) return null;
    const first = firstDayOf(habits);
    if (!first) return discoveries([], today, settings.weekStartsOn);
    const stats = buildHistory(
      habits,
      entries,
      first,
      today,
      settings.weekStartsOn,
    );
    return discoveries(stats, today, settings.weekStartsOn);
  }, [hydrated, today, habits, entries, settings.weekStartsOn]);

  if (!view) return <Skeleton />;

  const { found, thisWeek } = view;
  const rate =
    thisWeek.scheduled === 0 ? null : thisWeek.completed / thisWeek.scheduled;
  const target = Math.round(QUALIFYING_RATE * 100);

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="display-type text-[15px]">Creatures</h1>
        <p className="font-mono text-[12px] tabular-nums text-muted">
          {found}/{CREATURES.length} found
        </p>
      </div>

      <p className="text-[13px] leading-relaxed text-muted">
        {found === CREATURES.length ? (
          <>You have found every creature. More are on the way.</>
        ) : rate === null ? (
          <>
            Finish a week with at least {target}% of your habits done to
            discover a new creature.
          </>
        ) : (
          <>
            This week so far:{" "}
            <strong className="font-medium text-foreground">
              {Math.round(rate * 100)}%
            </strong>
            . End the week at {target}% or better to discover the next one.
          </>
        )}
      </p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CREATURES.map((creature, index) => {
          const known = index < found;
          return (
            <li
              key={creature.id}
              className="surface-card flex flex-col items-center bg-surface px-3 py-4 text-center"
            >
              <Sprite creature={creature} silhouette={!known} />
              <p className="mt-2 text-[13px] font-medium">
                {known ? creature.name : "???"}
              </p>
              {known && (
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  {creature.blurb}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sprite({
  creature,
  silhouette,
}: {
  creature: Creature;
  silhouette: boolean;
}) {
  const [poked, setPoked] = useState(false);
  const size = creature.sprite.length;
  const rig = silhouette ? undefined : creature.rig;
  const parts = Object.entries(rig?.parts ?? {});
  const pixels = creature.sprite.flatMap((row, y) =>
    [...row].flatMap((key, x): Pixel[] => (key === "." ? [] : [[x, y, key]])),
  );
  const inside = ([x, y]: Pixel, [bx, by, w, h]: PixelBox) =>
    x >= bx && x < bx + w && y >= by && y < by + h;
  const draw = ([x, y, key]: Pixel) => (
    <rect
      key={`${x},${y}`}
      x={x}
      y={y}
      width={1}
      height={1}
      data-px={key}
      fill={silhouette ? "currentColor" : creature.colors[key]}
    />
  );
  // Keyframes name colours by key, e.g. a blink is `fill: var(--o)`.
  const inks = Object.fromEntries(
    Object.entries(creature.colors).map(([key, hex]) => [`--${key}`, hex]),
  ) as CSSProperties;

  const svg = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size * 6}
      height={size * 6}
      shapeRendering="crispEdges"
      className={silhouette ? "text-muted" : "overflow-visible"}
      data-creature={rig && creature.id}
      style={rig && inks}
      role="img"
      aria-label={silhouette ? "Undiscovered creature" : creature.name}
    >
      <g>
        <g
          data-poked={poked || undefined}
          onAnimationEnd={(e) =>
            e.target === e.currentTarget && setPoked(false)
          }
        >
          {pixels
            .filter((p) => !parts.some(([, box]) => inside(p, box)))
            .map(draw)}
          {Object.entries(rig?.fx ?? {}).map(([name, fx]) => (
            <g key={name} data-fx={name}>
              {fx.map(draw)}
            </g>
          ))}
          {parts.map(([name, box]) => (
            <g key={name} data-part={name}>
              {pixels.filter((p) => inside(p, box)).map(draw)}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );

  if (!rig) return svg;
  return (
    <button
      type="button"
      onClick={() => setPoked(true)}
      className="cursor-pointer touch-manipulation"
    >
      {svg}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="h-48 rounded-card bg-surface-2" />
    </div>
  );
}
