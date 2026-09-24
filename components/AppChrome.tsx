"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { touchReminders } from "@/lib/reminders";
import { useSignedIn, useSessionSync } from "@/lib/session";
import { useHydrate } from "@/lib/store";
import { useSync } from "@/lib/sync/client";
import { watchPaletteMode } from "@/lib/use-palette";

/**
 * Reads IndexedDB into the store, starts sync, and registers the service worker.
 * Mounted once, in the root layout.
 */
export function Hydrator() {
  useHydrate();
  // Order against `useSync` does not matter: a stale hint costs a delayed
  // first sync, and the server decides either way.
  useSessionSync();
  // Inert until hydration, and when signed out or the deployment has no
  // database.
  useSync();

  // An inline style cannot hold a media query, so the swap CSS does for free
  // happens here. Inert when no palette is set.
  useEffect(watchPaletteMode, []);

  // Keeps this device out of the sweep's dormant pile (`SUBSCRIPTION_TTL_MS`).
  // Silent for a browser with reminders off, which is why it can sit on the
  // app-start path at all.
  const signedIn = useSignedIn();
  useEffect(() => {
    if (signedIn) void touchReminders();
  }, [signedIn]);

  useEffect(() => {
    // Skipped in development: a caching worker turns HMR into a stale-asset hunt.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) =>
        console.error("openhabits: service worker failed", error),
      );
  }, []);

  return null;
}

const TABS = [
  { href: "/", label: "Today", icon: TodayIcon },
  { href: "/week", label: "Week", icon: WeekIcon },
  { href: "/stats", label: "Stats", icon: StatsIcon },
  { href: "/dex", label: "Dex", icon: DexIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-slot="nav"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-safe backdrop-blur"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                data-slot="tab"
                data-active={active ? "true" : undefined}
                className={`flex min-h-11 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon filled={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { filled?: boolean };

function base(filled?: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: filled ? 2.2 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function TodayIcon({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function WeekIcon({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function StatsIcon({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <rect x="3" y="4" width="5" height="5" rx="1" />
      <rect x="10" y="4" width="5" height="5" rx="1" />
      <rect x="17" y="4" width="4" height="5" rx="1" />
      <rect x="3" y="11" width="5" height="5" rx="1" />
      <rect x="10" y="11" width="5" height="5" rx="1" />
      <rect x="3" y="18" width="5" height="3" rx="1" />
    </svg>
  );
}

function DexIcon({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <path d="M12 3c-4 3-7 6-7 10a7 7 0 0 0 14 0c0-4-3-7-7-10Z" />
      <circle cx="9.5" cy="13" r="1" />
      <circle cx="14.5" cy="13" r="1" />
    </svg>
  );
}

function SettingsIcon({ filled }: IconProps) {
  return (
    <svg {...base(filled)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}
