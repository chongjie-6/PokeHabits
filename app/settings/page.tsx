"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AccountCard } from "@/components/AccountCard";
import { InstallCard } from "@/components/DownloadAppButton";
import { ReminderCard } from "@/components/ReminderCard";
import { habitColor } from "@/lib/colors";
import { HAPTIC_DONE, vibrate } from "@/lib/haptics";
import { activeTagsFor, deckCountFor, MODE_COPY, tagsFor } from "@/lib/daily";
import { applySkin, SKINS, useSkin, type Skin } from "@/lib/skin";
import { usePalette } from "@/lib/use-palette";
import { changeTheme, useTheme } from "@/lib/use-theme";
import {
  exportBundle,
  importBundle,
  moveHabit,
  resetEverything,
  updateSettings,
  useOpenHabits,
  type ImportMode,
} from "@/lib/store";
import { parseBackup } from "@/lib/sync/validate";
import type { Theme } from "@/lib/theme";
import type { AnyExportBundle, Habit, Settings } from "@/lib/types";

export default function SettingsPage() {
  const { hydrated, habits, settings } = useOpenHabits();
  // Safe as on Today: everything below sits behind the `hydrated` gate.
  const skin = useSkin();
  // Same gating rule as `useSkin` — behind `hydrated`, this has the real answer.
  const palette = usePalette();
  // And again. All three appearance axes are device-local and read the same way.
  const theme = useTheme();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState<AnyExportBundle | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  function download() {
    const bundle = exportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `openhabits-backup-${bundle.exportedAt.slice(0, 10)}.json`;
    link.click();
    // Revoking in the same task can cancel a download that has not started
    // reading the blob yet.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice("Backup downloaded.");
  }

  /**
   * Parse and hold rather than import on sight: `importBundle`'s "replace" mode
   * wipes the device first, and the choice belongs to the user at the one
   * moment they have the context to answer it.
   */
  async function choose(file: File) {
    try {
      // Checked record by record, not just by version: see `parseBackup`.
      const parsed = parseBackup(JSON.parse(await file.text()));
      if (!parsed.ok) throw new Error(parsed.message);
      setNotice(null);
      setPending(parsed.value);
    } catch (error) {
      setPending(null);
      setNotice(
        error instanceof Error
          ? `Could not read that file: ${error.message}`
          : "Import failed.",
      );
    }
  }

  function run(bundle: AnyExportBundle, mode: ImportMode) {
    try {
      importBundle(bundle, mode);
      setNotice(
        mode === "replace"
          ? `Replaced everything with ${bundle.habits.length} habits and ${bundle.entries.length} entries.`
          : `Merged ${bundle.habits.length} habits and ${bundle.entries.length} entries.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed.",
      );
    } finally {
      setPending(null);
      setConfirmReplace(false);
    }
  }

  if (!hydrated) return <Skeleton />;

  const active = habits.filter((h) => h.archivedAt === null);
  const archived = habits.filter((h) => h.archivedAt !== null);

  return (
    <section className="space-y-6">
      <h1 className="display-type text-[15px]">Settings</h1>

      <InstallCard />

      <AccountCard />

      <Group title="Appearance">
        <Choice<Theme>
          label="Theme"
          value={theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={changeTheme}
        />
        <Choice<Skin>
          label="Design"
          hint={SKINS.find((s) => s.value === skin)?.hint}
          value={skin}
          options={SKINS.map(({ value, label }) => ({ value, label }))}
          onChange={applySkin}
        />
        <div className="mt-4">
          <Link
            href="/settings/colours"
            className="flex min-h-11 items-center gap-2 rounded-control px-1 transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Colours</span>
              <span className="block text-[11px] leading-relaxed text-muted">
                {palette === null
                  ? "Using this design's own palette."
                  : "Your own palette."}{" "}
                Build one from a single colour, or set every token by hand.
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-muted">
              ›
            </span>
          </Link>
        </div>
      </Group>

      <Group title="Daily card">
        <Choice<Settings["dailyMode"]>
          label="Show me"
          value={settings.dailyMode}
          options={[
            { value: "quotes", label: MODE_COPY.quotes.label },
            { value: "facts", label: MODE_COPY.facts.label },
          ]}
          onChange={(dailyMode) => updateSettings({ dailyMode })}
        />
        <DeckTags settings={settings} />
      </Group>

      <Group title="Feedback">
        <Choice<Settings["haptics"]>
          label="Vibrate on a tick"
          value={settings.haptics}
          options={[
            { value: true, label: "On" },
            { value: false, label: "Off" },
          ]}
          onChange={(haptics) => {
            updateSettings({ haptics });
            // Switching it on should demonstrate what was switched on.
            if (haptics) vibrate(HAPTIC_DONE);
          }}
        />
      </Group>

      <Group title="Your week">
        <Choice<Settings["weekStartsOn"]>
          label="Week starts on"
          value={settings.weekStartsOn}
          options={[
            { value: 1, label: "Monday" },
            { value: 0, label: "Sunday" },
          ]}
          onChange={(weekStartsOn) => updateSettings({ weekStartsOn })}
        />
        <Choice<number>
          label="Day rolls over at"
          value={settings.dayStartHour}
          options={[
            { value: 0, label: "Midnight" },
            { value: 3, label: "3am" },
            { value: 4, label: "4am" },
            { value: 5, label: "5am" },
          ]}
          onChange={(dayStartHour) => updateSettings({ dayStartHour })}
        />
      </Group>

      {active.length > 0 && (
        <Group title="Habits">
          <ul className="divide-y divide-border">
            {active.map((habit, index) => (
              <li key={habit.id} className="flex items-center gap-1 py-1">
                <HabitLink habit={habit} />
                <IconButton
                  label={`Move ${habit.name} up`}
                  disabled={index === 0}
                  onClick={() => moveHabit(habit.id, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${habit.name} down`}
                  disabled={index === active.length - 1}
                  onClick={() => moveHabit(habit.id, 1)}
                >
                  ↓
                </IconButton>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Open a habit to rename it, change how often it runs, archive it, or
            delete it.
          </p>
        </Group>
      )}

      {archived.length > 0 && (
        <Group title="Archived">
          <ul className="divide-y divide-border">
            {archived.map((habit) => (
              <li key={habit.id} className="py-1 opacity-60">
                <HabitLink habit={habit} />
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group title="Your data">
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={download}>Export backup</Button>
          <Button onClick={() => fileInput.current?.click()}>
            Import backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            // `sr-only` hides it visually but leaves it focusable, so a
            // keyboard user landed on an invisible, unlabelled file input. The
            // visible button is the control; this is the mechanism behind it.
            aria-label="Choose a backup file to import"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void choose(file);
              event.target.value = "";
            }}
          />
        </div>
        {pending && (
          <div className="mt-3 rounded-control border border-border p-3">
            <p className="text-[13px] font-medium">
              {pending.habits.length} habits and {pending.entries.length}{" "}
              entries in that file.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              <strong className="font-medium text-foreground">Merge</strong>{" "}
              keeps what is on this device and adds anything the file has that
              it does not; where both have the same day, the newer one wins.{" "}
              <strong className="font-medium text-foreground">Replace</strong>{" "}
              deletes everything here first, including habits the backup never
              had.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => run(pending, "merge")}>Merge</Button>
              {confirmReplace ? (
                <Button danger onClick={() => run(pending, "replace")}>
                  Yes, replace everything
                </Button>
              ) : (
                <Button danger onClick={() => setConfirmReplace(true)}>
                  Replace
                </Button>
              )}
              <Button
                onClick={() => {
                  setPending(null);
                  setConfirmReplace(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {notice && (
          <p role="status" className="mt-3 text-[12px] text-accent">
            {notice}
          </p>
        )}
      </Group>

      <ReminderCard />

      <Group title="Danger zone">
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-danger">
              Delete every habit and all history?
            </p>
            <Button
              danger
              onClick={() => {
                resetEverything();
                setConfirmReset(false);
                setNotice("Everything deleted.");
              }}
            >
              Yes, delete it all
            </Button>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        ) : (
          <Button danger onClick={() => setConfirmReset(true)}>
            Delete all data
          </Button>
        )}
      </Group>

      <p className="pb-4 text-center text-[11px] text-muted">
        OpenHabits · {deckCountFor(settings.dailyMode, settings.dailyTags)}{" "}
        {MODE_COPY[settings.dailyMode].many} in the deck ·{" "}
        {settings.favourites.length} saved
      </p>
    </section>
  );
}

/**
 * Which tags the daily card may draw from (§5.3). Only the active mode's are
 * offered, though the stored list is flat across both, so a selection survives
 * a trip through the other corpus. Nothing here can empty the deck:
 * deselecting everything is the default, and `lib/daily.ts` falls back.
 */
function DeckTags({ settings }: { settings: Settings }) {
  const mode = settings.dailyMode;
  const copy = MODE_COPY[mode];
  const selected = new Set(activeTagsFor(mode, settings.dailyTags));

  function toggle(tag: string) {
    const next = selected.has(tag)
      ? settings.dailyTags.filter((t) => t !== tag)
      : [...settings.dailyTags, tag];
    updateSettings({ dailyTags: next });
  }

  function clear() {
    const others = new Set(tagsFor(mode));
    updateSettings({
      dailyTags: settings.dailyTags.filter((t) => !others.has(t)),
    });
  }

  return (
    <fieldset className="mt-4 border-t border-border pt-4">
      <legend className="sr-only">Which {copy.many} to draw from</legend>
      <p className="text-[13px] font-medium">Draw from</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tagsFor(mode).map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={selected.has(tag)}
            onClick={() => toggle(tag)}
            className={`h-8 rounded-full border px-3 text-[12px] capitalize transition-colors ${
              selected.has(tag)
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {tag}
          </button>
        ))}
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clear}
            className="h-8 rounded-full px-3 text-[12px] text-accent"
          >
            Use all
          </button>
        )}
      </div>
    </fieldset>
  );
}

function HabitLink({ habit }: { habit: Habit }) {
  return (
    <Link
      href={`/habit?id=${habit.id}`}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-1 transition-colors hover:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: habitColor(habit.color) }}
      />
      <span aria-hidden="true">{habit.emoji}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">{habit.name}</span>
      <span aria-hidden="true" className="shrink-0 text-muted">
        ›
      </span>
    </Link>
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

function Choice<T extends string | number | boolean>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mb-4 last:mb-0">
      <legend className="text-[13px] font-medium">{label}</legend>
      {hint && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-control border px-3 text-[13px] transition-colors ${
              option.value === value
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Button({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-control border px-3 text-[13px] font-medium transition-colors ${
        danger
          ? "border-danger text-danger hover:bg-danger hover:text-surface"
          : "border-border text-foreground hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-[13px] disabled:opacity-25 ${
        danger ? "text-danger" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="h-32 rounded-card bg-surface-2" />
      <div className="h-32 rounded-card bg-surface-2" />
    </div>
  );
}
