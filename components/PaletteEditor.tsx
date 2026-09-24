"use client";

/**
 * The colour editor (§6.6). Every change applies immediately, like a habit tick
 * — no save button, nothing to await, the palette *is* the preview. The one
 * thing that cannot preview itself is the half you are not in, hence `Preview`
 * and an audit panel that measure the edited half rather than the one on screen.
 */

import { useMemo, useState } from "react";
import { formatRatio } from "@/lib/contrast";
import {
  PRESETS,
  TOKEN_GROUPS,
  audit,
  derivePalette,
  isPaletteHex,
  type Mode,
  type PaletteToken,
  type Palette,
  type Swatches,
} from "@/lib/palette";
import { SKINS, useSkin } from "@/lib/skin";
import { resolveMode } from "@/lib/theme";
import { changePalette, paletteFromSkin, usePalette } from "@/lib/use-palette";

export function PaletteEditor() {
  const palette = usePalette();
  const skin = useSkin();
  // Safe to read the document: this only renders inside the page's `hydrated`
  // gate, so the pre-paint script has already run.
  const [mode, setMode] = useState<Mode>(resolveMode);

  // The active skin's own colours, so "customise" starts from what is on
  // screen. Memoised because `paletteFromSkin` drives `data-theme` through both
  // modes to read them. `skin` is the dependency though it is not an argument:
  // it is what decides the stylesheet's answers, and the linter cannot see
  // through the DOM read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const skinPalette = useMemo(() => paletteFromSkin(), [skin]);
  const shown: Palette = palette ?? skinPalette;
  const swatches = shown[mode];
  const rows = audit(swatches);
  const failures = rows.filter((row) => !row.passes);

  function edit(token: PaletteToken, colour: string) {
    changePalette({ ...shown, [mode]: { ...swatches, [token]: colour } });
  }

  const skinLabel = SKINS.find((s) => s.value === skin)?.label ?? "Classic";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="display-type text-[15px]">Colours</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {palette === null
            ? `You are using the ${skinLabel} design's own colours. Pick a base below to build your own, or start from these and change what you like.`
            : "Your own colours. Every change applies straight away, everywhere."}{" "}
          This device only — like the design, colours are not part of a backup
          and do not sync.
        </p>
      </div>

      <Group title="Base colour">
        <p className="text-[13px] leading-relaxed text-muted">
          One colour builds the whole set. Surfaces take a trace of it, text and
          accents are solved against the surfaces they sit on, so the result
          clears AA whichever colour you pick.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => changePalette(derivePalette(preset.seed))}
              className="flex h-9 items-center gap-2 rounded-control border border-border px-2.5 text-[13px] text-foreground transition-colors hover:bg-surface-2"
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: preset.seed }}
              />
              {preset.label}
            </button>
          ))}
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-2.5 text-[13px] text-foreground transition-colors hover:bg-surface-2">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 rounded-full border border-border"
              style={{ background: swatches["--accent"] }}
            />
            Pick a colour
            <input
              type="color"
              value={swatches["--accent"]}
              onChange={(event) =>
                changePalette(derivePalette(event.target.value))
              }
              className="sr-only"
            />
          </label>
        </div>
        {palette !== null && (
          <div className="mt-3 flex flex-wrap gap-2">
            <SmallButton onClick={() => changePalette(paletteFromSkin())}>
              Start from {skinLabel}
            </SmallButton>
            <SmallButton onClick={() => changePalette(null)}>
              Back to {skinLabel}&rsquo;s colours
            </SmallButton>
          </div>
        )}
      </Group>

      <Group title="Fine tuning">
        <fieldset>
          <legend className="text-[13px] font-medium">Editing</legend>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Each palette holds both. The preview below shows the half you are
            editing, whichever your device is currently in.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["light", "dark"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === mode}
                onClick={() => setMode(option)}
                className={`h-9 rounded-control border px-3 text-[13px] capitalize transition-colors ${
                  option === mode
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <Preview swatches={swatches} />

        <div className="mt-5 space-y-5">
          {TOKEN_GROUPS.map((group) => (
            <fieldset key={group.title}>
              <legend className="text-[13px] font-medium">{group.title}</legend>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                {group.hint}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.tokens.map(({ token, label }) => (
                  <Field
                    key={token}
                    label={label}
                    value={swatches[token]}
                    onChange={(colour) => edit(token, colour)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Group>

      <Group title="Contrast">
        <p className="text-[13px] leading-relaxed text-muted">
          {failures.length === 0
            ? "Every pairing clears its target."
            : `${failures.length} of these ${failures.length === 1 ? "pairing is" : "pairings are"} below target. Nothing stops you — the numbers are here so the choice is an informed one.`}{" "}
          AA is 4.5:1 for text and 3:1 for a focus ring. The last two are not a
          standard, just a floor below which a step has vanished into the one
          under it.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-3 py-2">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-border text-[11px] font-semibold"
                style={{
                  background: swatches[row.bg],
                  color: swatches[row.fg],
                }}
              >
                Aa
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {row.label}
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted">
                {formatRatio(row.ratio)}
              </span>
              <span
                className={`shrink-0 text-[11px] font-medium ${
                  row.passes ? "text-accent" : "text-danger"
                }`}
              >
                {row.passes ? "ok" : `needs ${row.min}`}
              </span>
            </li>
          ))}
        </ul>
      </Group>
    </section>
  );
}

/**
 * A miniature of the app in the half being edited. Colours are passed
 * explicitly, not as custom properties: the page has its own palette applied,
 * and a `var()` would resolve against whichever of the two won.
 */
function Preview({ swatches }: { swatches: Swatches }) {
  return (
    <div
      className="mt-4 rounded-card border border-border p-4"
      style={{ background: swatches["--background"] }}
    >
      <div
        className="rounded-card p-3"
        style={{
          background: swatches["--quote-bg"],
          color: swatches["--quote-fg"],
        }}
      >
        <p className="font-serif text-[13px] leading-relaxed">
          The impediment to action advances action.
        </p>
        <p
          className="mt-1 text-[11px]"
          style={{ color: swatches["--quote-meta"] }}
        >
          Marcus Aurelius
        </p>
      </div>

      <div
        className="mt-3 rounded-card border p-3"
        style={{
          background: swatches["--surface"],
          borderColor: swatches["--border"],
        }}
      >
        <p className="text-[13px]" style={{ color: swatches["--foreground"] }}>
          Read for 20 minutes
        </p>
        <p
          className="mt-0.5 text-[11px]"
          style={{ color: swatches["--muted"] }}
        >
          9 day streak
        </p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {(["--hm-0", "--hm-1", "--hm-2", "--hm-3", "--hm-4"] as const).map(
            (token) => (
              <span
                key={token}
                className="h-4 w-4 rounded-cell"
                style={{ background: swatches[token] }}
              />
            ),
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span
            className="rounded-control px-2.5 py-1 text-[12px] font-medium"
            style={{
              background: swatches["--accent"],
              color: swatches["--accent-fg"],
            }}
          >
            Done
          </span>
          <span
            className="rounded-control px-2.5 py-1 text-[12px]"
            style={{
              background: swatches["--surface-2"],
              color: swatches["--muted"],
            }}
          >
            Skip
          </span>
          <span className="text-[12px]" style={{ color: swatches["--danger"] }}>
            Delete
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (colour: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);

  // A preset rewrites this field from outside; adjusting during render rather
  // than in an effect keeps the old colour off the screen for a frame.
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  function commit(next: string) {
    setDraft(next);
    const colour = next.trim().toLowerCase();
    // Half-typed hex is a normal state of a text field, not an error to report.
    if (isPaletteHex(colour)) onChange(colour);
  }

  return (
    <label className="flex items-center gap-2">
      <span className="relative h-9 w-9 shrink-0">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} colour`}
          className="h-9 w-9 cursor-pointer rounded-control border border-border bg-transparent p-1"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted">{label}</span>
        <input
          type="text"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} hex`}
          onChange={(event) => commit(event.target.value)}
          onBlur={() => setDraft(value)}
          className="w-full bg-transparent font-mono text-[12px] text-foreground outline-none"
        />
      </span>
    </label>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card bg-surface p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
      </h2>
      {children}
    </div>
  );
}

function SmallButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-control border border-border px-3 text-[13px] text-foreground transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
