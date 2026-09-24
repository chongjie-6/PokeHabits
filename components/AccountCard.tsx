"use client";

/**
 * Sign in, create an account, sign out. See DESIGN.md §13.6 and §13.10.
 * Everything is gated on `mounted` (§8.4): the service worker caches this
 * route's HTML, so anything account-shaped here would reach the next visitor.
 */

import { useState, useSyncExternalStore } from "react";
import { disableReminders } from "@/lib/reminders";
import { authClient, markSignedIn, markSignedOut } from "@/lib/session";
import {
  adoptAccount,
  currentState,
  syncMeta,
  useOpenHabits,
  type SyncStatus,
} from "@/lib/store";
import { syncNow } from "@/lib/sync/client";

type Mode = "sign-in" | "sign-up";

/**
 * What just happened to the account, held here rather than in `SignedOut`,
 * which unmounts the moment a mailer-less sign-up flips `useSession`.
 *
 * `verify` is reachable from both sides, and `origin` is the only difference in
 * the copy. `created` is certain only with no mailer, since Better Auth hides a
 * duplicate behind a synthetic success. `habits` is counted at sign-up rather
 * than read live, because a 409 can empty the store mid-banner, and `session`
 * binds the banner to the token that earned it.
 */
type Outcome =
  | { kind: "verify"; email: string; origin: Mode }
  | { kind: "created"; email: string; habits: number; session: string }
  /** A reset was asked for. Says "sent" whether or not the address exists. */
  | { kind: "reset-sent"; email: string }
  /** Signed in, sync held until the local habits are claimed (§13.8 #8). */
  | { kind: "confirm-merge"; email: string; habits: number };

/**
 * False on the server and through hydration. The server snapshot reports the
 * hidden case, so account UI only ever appears, never disappears (§8.4).
 */
const NEVER_CHANGES = () => () => {};

function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

const UNREACHABLE =
  "Could not reach the server. Check your connection and try again.";

/**
 * The auth client's answer, or null when the request threw rather than
 * answering — Better Auth reports a refusal as `{ error }`, a dead network
 * rejects.
 */
async function attempt<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch {
    return null;
  }
}

export function AccountCard() {
  const { data: session, isPending } = authClient.useSession();
  const { syncStatus } = useOpenHabits();
  const mounted = useMounted();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Leaving the wait remounts `SignedOut` with every field blank, which reads
  // as the sign-up having come undone.
  const [resumeEmail, setResumeEmail] = useState("");

  if (!mounted || isPending) {
    return (
      <Card>
        <div
          aria-hidden="true"
          className="h-24 animate-pulse rounded-control bg-surface-2"
        />
      </Card>
    );
  }

  // Ahead of the session check: the wait is a browser with no session.
  if (outcome?.kind === "verify") {
    return (
      <Card>
        <AwaitingVerification
          email={outcome.email}
          origin={outcome.origin}
          onDone={() => {
            setResumeEmail(outcome.email);
            setOutcome(null);
          }}
        />
      </Card>
    );
  }

  if (outcome?.kind === "reset-sent") {
    return (
      <Card>
        <ResetRequested email={outcome.email} onDone={() => setOutcome(null)} />
      </Card>
    );
  }

  // Ahead of the session check: a session exists, but the device is not
  // syncing until this is answered.
  if (outcome?.kind === "confirm-merge") {
    return (
      <Card>
        <ConfirmMerge
          email={outcome.email}
          habits={outcome.habits}
          onDone={() => setOutcome(null)}
        />
      </Card>
    );
  }

  const created =
    outcome?.kind === "created" && outcome.session === session?.session.token
      ? outcome.habits
      : null;

  return (
    <Card>
      {session?.user ? (
        <SignedIn
          email={session.user.email}
          syncStatus={syncStatus}
          created={created}
          onClearCreated={() => setOutcome(null)}
        />
      ) : (
        <SignedOut initialEmail={resumeEmail} onOutcome={setOutcome} />
      )}
    </Card>
  );
}

/** A failure worth reading; `offerSignIn` marks the one with an obvious fix. */
type FormError = { text: string; offerSignIn?: boolean };

function SignedOut({
  initialEmail,
  onOutcome,
}: {
  /** Seeds the field on mount only — returning from the wait is a fresh mount. */
  initialEmail: string;
  onOutcome: (outcome: Outcome) => void;
}) {
  const { habits } = useOpenHabits();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const credentials = { email: email.trim(), password };
    // A request that throws rather than answering would leave the button on
    // "Working…" for good.
    const result = await attempt(() =>
      mode === "sign-up"
        ? authClient.signUp.email({
            ...credentials,
            // The schema requires a name and this app never asks for one.
            name: credentials.email.split("@")[0] || "OpenHabits",
          })
        : authClient.signIn.email(credentials),
    );

    setBusy(false);

    if (!result) {
      setError({ text: UNREACHABLE });
      return;
    }

    if (result.error) {
      // `sendOnSignIn` already resent the mail, so a 403 is the wait entered
      // from the other side, not a failure.
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        onOutcome({
          kind: "verify",
          email: credentials.email,
          origin: "sign-in",
        });
        return;
      }
      // Only reachable with no mailer, since Better Auth otherwise hides a
      // duplicate behind a synthetic success. Both spellings are thrown.
      if (
        result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
        result.error.code === "USER_ALREADY_EXISTS"
      ) {
        setError({
          text: "That address already has an account.",
          offerSignIn: true,
        });
        return;
      }
      setError({
        text: result.error.message ?? "That did not work. Try again.",
      });
      return;
    }

    // A sign-up under mandatory verification returns a null token: the hint
    // must stay unset, or sync spends the wait collecting 401s.
    if (!result.data?.token) {
      onOutcome({
        kind: "verify",
        email: credentials.email,
        origin: "sign-up",
      });
      return;
    }

    /**
     * A first sync uploads whatever is on the device (§13.8 #8) — right on your
     * own phone, a silent donation on a borrowed one, so it is consented to
     * rather than assumed. Nothing is uploaded while it waits: the cookie
     * exists, but withholding the local hint holds the push. A sign-*up* is
     * exempt, its account being empty and its owner the one holding the device.
     */
    if (
      mode === "sign-in" &&
      habits.length > 0 &&
      syncMeta().accountId === null
    ) {
      onOutcome({
        kind: "confirm-merge",
        email: credentials.email,
        habits: habits.length,
      });
      return;
    }

    // Set here rather than awaiting `useSessionSync`, so the first sync starts
    // on this tick.
    markSignedIn();
    void syncNow();

    // Signing in explains itself; being handed a session silently does not.
    if (mode === "sign-up") {
      onOutcome({
        kind: "created",
        email: credentials.email,
        habits: habits.length,
        session: result.data.token,
      });
    }
  }

  /**
   * The endpoint answers the same for an address it has never seen, so there is
   * nothing to report but "sent" — branching would build the enumeration oracle
   * the server avoids. `RESET_PASSWORD_DISABLED` is the one answer worth
   * surfacing, being a fact about the server rather than about the address.
   */
  async function forgot() {
    const address = email.trim();
    if (address === "") {
      setError({ text: "Fill in the address on the account first." });
      return;
    }

    setBusy(true);
    setError(null);
    const result = await attempt(() =>
      authClient.requestPasswordReset({
        email: address,
        redirectTo: "/reset-password",
      }),
    );
    setBusy(false);

    // A request that never arrived is not "sent", and says nothing about the address.
    if (!result) {
      setError({ text: UNREACHABLE });
      return;
    }

    if (result.error?.code === "RESET_PASSWORD_DISABLED") {
      setError({
        text: "This deployment cannot send mail, so passwords cannot be reset here.",
      });
      return;
    }

    onOutcome({ kind: "reset-sent", email: address });
  }

  return (
    <>
      <p className="text-[13px] leading-relaxed text-muted">
        An account keeps your habits on your other devices. It is entirely
        optional
      </p>

      <form onSubmit={submit} className="mt-3 space-y-2">
        {error && (
          <Banner tone="error">
            {error.text}
            {error.offerSignIn && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setError(null);
                  }}
                  className="underline underline-offset-4"
                >
                  Sign in instead
                </button>
              </>
            )}
          </Banner>
        )}

        <Field
          label="Email"
          type="email"
          value={email}
          autoComplete="username"
          onChange={(value) => {
            setEmail(value);
            setError(null);
          }}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete={
            mode === "sign-up" ? "new-password" : "current-password"
          }
          onChange={(value) => {
            setPassword(value);
            setError(null);
          }}
        />

        {mode === "sign-up" && (
          <p className="text-[11px] leading-relaxed text-muted">
            At least 10 characters. We send a link to confirm the address before
            the account can be used, so use one you can open — it is also where
            a password reset would go.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || email.trim() === "" || password === ""}
            className="h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50"
          >
            {busy
              ? "Working…"
              : mode === "sign-up"
                ? "Create account"
                : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-up" ? "sign-in" : "sign-up");
              setError(null);
            }}
            className="h-10 rounded-control px-2 text-[13px] text-muted underline underline-offset-4 hover:text-foreground"
          >
            {mode === "sign-up"
              ? "I already have an account"
              : "Create an account"}
          </button>
        </div>

        {mode === "sign-in" && (
          <p className="pt-1 text-[12px] text-muted">
            <button
              type="button"
              disabled={busy}
              onClick={() => void forgot()}
              className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            >
              Forgotten your password?
            </button>{" "}
            {email.trim() === "" && "Fill in your address first."}
          </p>
        )}
      </form>
    </>
  );
}

/**
 * The gap between signing up and clicking the link (§13.10). A state of the
 * form, not the app: no session, local habits untouched, which the copy must
 * say or "check your email" reads as data loss. Arriving from a 403 there is no
 * sign-up to confirm, hence `origin`. Resend answers identically for an unknown
 * address, so there is nothing to branch on.
 */
function AwaitingVerification({
  email,
  origin,
  onDone,
}: {
  email: string;
  origin: Mode;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    // Where the link lands once confirmed; the click signs that browser in.
    const result = await attempt(() =>
      authClient.sendVerificationEmail({
        email,
        callbackURL: "/",
      }),
    );
    setBusy(false);
    if (!result) {
      setError(UNREACHABLE);
      return;
    }
    if (result.error) {
      setError(result.error.message ?? "Could not send it. Try again shortly.");
      return;
    }
    setSent(true);
  }

  return (
    <>
      {origin === "sign-up" && (
        <div className="mb-2">
          <Banner tone="ok">
            Sign-up accepted — your link is on its way to{" "}
            <span className="font-medium">{email}</span>.
          </Banner>
        </div>
      )}

      <p className="text-[13px] leading-relaxed">
        {origin === "sign-up" ? (
          <>Open it to confirm the address and finish the account.</>
        ) : (
          <>
            Check <span className="font-medium">{email}</span> for a link to
            confirm the address.
          </>
        )}{" "}
        Signing in needs it.
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Nothing has left this device, and nothing will until you sign in — your
        habits are where they were. The link works on any device, and opening it
        signs that one in.
      </p>
      {origin === "sign-up" && (
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          If that address already had an account, no second one was made and no
          mail was sent — sign in with it instead. We answer the same way either
          way, so that this form cannot be used to find out who has an account.
        </p>
      )}

      {error && (
        <div className="mt-2">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {sent && !error && (
        <p role="status" className="mt-2 text-[12px] text-muted">
          Sent again. It can take a minute — check spam.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          {busy ? "Sending…" : "Resend email"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-control px-2 text-[13px] text-muted underline underline-offset-4 hover:text-foreground"
        >
          I have confirmed it — sign in
        </button>
      </div>
    </>
  );
}

/**
 * The consent step in front of the first upload (§13.8 #8). Both answers are
 * non-destructive: "not mine" signs out rather than wiping the device, because
 * on a borrowed phone those habits belong to whoever lent it.
 */
function ConfirmMerge({
  email,
  habits,
  onDone,
}: {
  email: string;
  habits: number;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function accept() {
    markSignedIn();
    void syncNow();
    onDone();
  }

  async function decline() {
    setBusy(true);
    setFailed(false);

    let ok = false;
    try {
      ok = (await authClient.signOut()).error == null;
    } catch {
      ok = false;
    }

    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }

    // The hint was never set, so nothing was pushed and the store is untouched.
    markSignedOut();
    onDone();
  }

  const count = `${habits} habit${habits === 1 ? "" : "s"}`;

  return (
    <>
      <p className="text-[13px] leading-relaxed">
        You signed in as <span className="font-medium">{email}</span>, and there
        {habits === 1 ? " is " : " are "}
        already <span className="font-medium">{count}</span> on this device.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Adding {habits === 1 ? "it" : "them"} copies{" "}
        {habits === 1 ? "it" : "them"} into the account, where your other
        devices will pick {habits === 1 ? "it" : "them"} up. If this is someone
        else&rsquo;s device, or{" "}
        {habits === 1 ? "that habit is" : "those habits are"} not yours, sign
        out instead — nothing has been uploaded yet, and nothing here will be
        changed.
      </p>

      {failed && (
        <div className="mt-2">
          <Banner tone="error">
            Could not sign out — the server did not answer. Nothing has been
            uploaded; try again in a moment.
          </Banner>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={accept}
          className="h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50"
        >
          Add {habits === 1 ? "it" : "them"} to this account
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decline()}
          className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          {busy ? "Signing out…" : "Not mine — sign out"}
        </button>
      </div>
    </>
  );
}

/**
 * Says nothing about whether the address has an account: the server answers
 * identically either way, and this screen must not undo that in the UI.
 */
function ResetRequested({
  email,
  onDone,
}: {
  email: string;
  onDone: () => void;
}) {
  return (
    <>
      <Banner tone="ok">
        If <span className="font-medium">{email}</span> has an account, a link
        to set a new password is on its way.
      </Banner>
      <p className="mt-2 text-[13px] leading-relaxed">
        Open it within the hour — the link works once, and expires after that.
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        We answer the same way for an address with no account, so this form
        cannot be used to find out who has one. Nothing on this device has
        changed, and the current password still works until a new one is set.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
        >
          Back to sign in
        </button>
      </div>
    </>
  );
}

function SignedIn({
  email,
  syncStatus,
  created,
  onClearCreated,
}: {
  email: string;
  syncStatus: SyncStatus;
  /** Habits on this device when the account was just created here, else null. */
  created: number | null;
  onClearCreated: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warned, setWarned] = useState(false);
  const [failed, setFailed] = useState(false);

  async function attemptSignOut() {
    setBusy(true);

    // Push before wiping: anything ticked offline exists nowhere else.
    await syncNow();
    setBusy(false);

    // `syncNow` reports through the store rather than throwing, and the prop
    // is this render's status — from before the sync just awaited.
    if (currentState().syncStatus.kind === "error") {
      setWarned(true);
      return;
    }

    await finish();
  }

  async function finish() {
    setBusy(true);
    setFailed(false);

    // Before the cookie goes, since only the session proves this endpoint
    // belongs to the account — and a row left behind keeps the cron pushing
    // these habits into the tray of whoever holds the device next.
    await disableReminders();

    // The wipe waits on success: the cookie survives a failed sign-out, and
    // `useSession` would then report a session over an emptied store.
    let ok = false;
    try {
      ok = (await authClient.signOut()).error == null;
    } catch {
      ok = false;
    }

    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }

    markSignedOut();
    // Emptied and the cursor reset, so the next person here starts from their
    // own server state.
    adoptAccount(null);
    setConfirming(false);
    setWarned(false);
  }

  return (
    <>
      {created !== null && (
        <div className="mb-3">
          <Banner tone="ok">
            Account created.{" "}
            {created > 0
              ? `The ${created} habit${created === 1 ? "" : "s"} on this device ${
                  created === 1 ? "is" : "are"
                } being added to it now.`
              : "Anything you add here is kept in it from now on."}{" "}
            <button
              type="button"
              onClick={onClearCreated}
              className="underline underline-offset-4"
            >
              Dismiss
            </button>
          </Banner>
        </div>
      )}

      <p className="text-[13px]">
        Signed in as <span className="font-medium">{email}</span>
      </p>
      <p className="mt-1 text-[12px] text-muted">{describe(syncStatus)}</p>

      {confirming ? (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] leading-relaxed">
            Sign out and remove your habits from this device? They stay in your
            account, and signing back in brings them here again.
          </p>
          {warned && (
            <p role="alert" className="text-[12px] text-danger">
              Could not reach the server, so changes made here may not be saved
              yet. Signing out now would lose them.
            </p>
          )}
          {failed && (
            <p role="alert" className="text-[12px] text-danger">
              Could not sign out — the server did not answer. Nothing has
              changed on this device; try again in a moment.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void (warned ? finish() : attemptSignOut())}
              className="h-10 rounded-control border border-danger px-3 text-[13px] font-medium text-danger transition-colors hover:bg-danger hover:text-surface disabled:opacity-50"
            >
              {busy ? "Saving…" : warned ? "Sign out anyway" : "Sign out"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setWarned(false);
                setFailed(false);
              }}
              className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
}

function describe(status: SyncStatus): string {
  switch (status.kind) {
    case "syncing":
      return "Syncing…";
    case "idle":
      return "Everything is up to date.";
    case "error":
      return status.message;
    case "off":
      return "Not syncing yet.";
  }
}

/** `alert` interrupts a screen reader and `status` waits its turn. */
function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-control border px-3 py-2 text-[12px] leading-relaxed ${
        tone === "error"
          ? "border-danger text-danger"
          : "border-accent text-accent"
      }`}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  type,
  value,
  autoComplete,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-control border border-border bg-surface-2 px-3 text-[14px] outline-none focus:border-accent"
      />
    </label>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface-card bg-surface p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Account
      </h2>
      {children}
    </div>
  );
}
