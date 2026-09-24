"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * The "Add to Home Screen" affordance (§8.4). Intercepts
 * `beforeinstallprompt`, reversing an earlier decision: the two-tier experience
 * is handled rather than avoided, with Chromium getting the browser's prompt
 * and every other engine a sheet worded for the browser it is running in.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISPLAY_MODE = "(display-mode: standalone)";

// It fires once, early, usually before React has hydrated — so it is caught at
// module scope, where a late mount still has it.

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this the browser shows its own bar as well as our button.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

type InstallState = "hidden" | "prompt" | "manual";

function isStandalone(): boolean {
  return (
    window.matchMedia(DISPLAY_MODE).matches ||
    // iOS Safari's own flag, which predates the media query.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const mq = window.matchMedia(DISPLAY_MODE);
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onChange);
  };
}

function getSnapshot(): InstallState {
  if (isStandalone()) return "hidden";
  return deferredPrompt ? "prompt" : "manual";
}

type IosKind = "safari" | "chrome" | "firefox" | "brave" | "inapp";

function iosKind(): IosKind | null {
  const ua = navigator.userAgent;
  if (!/iphone|ipad|ipod/i.test(ua)) return null;
  if (
    /Instagram|FBAN|FBAV|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp/i.test(
      ua,
    )
  ) {
    return "inapp";
  }
  if (/CriOS|EdgiOS/i.test(ua)) return "chrome";
  if (/FxiOS/i.test(ua)) return "firefox";
  if (/Brave/i.test(ua) || "brave" in navigator) return "brave";
  return "safari";
}

function stepsFor(kind: IosKind | null): string[] {
  if (kind === "chrome") {
    return [
      "Tap \u22ef at the bottom of Chrome, then Share.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ];
  }
  if (kind === "firefox") {
    return [
      "Open the Firefox menu, then tap Share.",
      "Tap Add to Home Screen.",
      "Tap Add.",
    ];
  }
  if (kind === "safari" || kind === "brave") {
    return ["Tap Share.", "Tap Add to Home Screen.", "Tap Add."];
  }
  return [
    "Open your browser menu.",
    "Tap Install or Add to Home screen.",
    "Confirm.",
  ];
}

function ShareIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="inline-block align-[-0.2em]"
    >
      <path d="M12 4v10" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

const DEFAULT_CLASS =
  "h-11 w-full rounded-control bg-accent text-[14px] font-semibold text-accent-fg";

function useInstallState(): InstallState {
  // The server snapshot claims "already installed", so the button only ever
  // appears and never disappears out of cached HTML.
  return useSyncExternalStore(subscribe, getSnapshot, () => "hidden");
}

export function DownloadAppButton({ className = "" }: { className?: string }) {
  const state = useInstallState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (sheetOpen && !element.open) element.showModal();
    if (!sheetOpen && element.open) element.close();
  }, [sheetOpen]);

  async function onClick() {
    const event = deferredPrompt;
    if (state === "prompt" && event) {
      // One shot only: the browser will not replay a prompt it has spent.
      deferredPrompt = null;
      emit();
      await event.prompt();
      return;
    }
    setCopied(false);
    setSheetOpen(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (state === "hidden") return null;

  const kind = iosKind();

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        className={className || DEFAULT_CLASS}
      >
        Add to Home Screen
      </button>
      <dialog
        ref={dialog}
        onClose={() => setSheetOpen(false)}
        aria-label="Add OpenHabits to your home screen"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] surface-card bg-surface p-6 text-foreground backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="display-type text-[15px]">
            Add OpenHabits to your home screen
          </h2>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
            className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded-control text-muted"
          >
            &#x2715;
          </button>
        </div>
        {kind === "inapp" ? (
          <div className="mt-4">
            <p className="text-[13px] leading-relaxed text-muted">
              Open this page in Safari, Chrome, Firefox, or Brave, then tap Add
              to Home Screen.
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className={`mt-5 ${DEFAULT_CLASS}`}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : (
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-[13px] leading-relaxed">
            {stepsFor(kind).map((step, index) => (
              <li key={step}>
                {index === 0 && kind ? (
                  <>
                    <ShareIcon /> {step}
                  </>
                ) : (
                  step
                )}
              </li>
            ))}
          </ol>
        )}
      </dialog>
    </>
  );
}

/**
 * The Settings-screen presentation, gated on the same state as the button so
 * the card is never wrapped around a component that rendered null.
 */
export function InstallCard() {
  const state = useInstallState();

  if (state === "hidden") return null;

  return (
    <div className="surface-card bg-surface-2 p-4">
      <p className="text-[13px] font-medium">
        Add OpenHabits to your home screen
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        It opens full screen, starts on Today, and works offline.
      </p>
      <DownloadAppButton className={`mt-3 ${DEFAULT_CLASS}`} />
    </div>
  );
}
