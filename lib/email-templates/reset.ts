/**
 * The password-reset email. See DESIGN.md §13.13. Says less than the
 * verification mail on purpose: an unauthenticated form sends it, so it reaches
 * people who did not ask. It must not confirm an account exists, must not name
 * anyone, and reads as "someone asked", not "your account is at risk". The lit
 * square is the last rather than the first — this is a return, not a beginning.
 */

import { button, hero, shell } from "./layout";

export const RESET_SUBJECT = "A new password for OpenHabits";

const PREHEADER = "The link is good for one hour, then it expires on its own.";

const LIT = { row: 3, column: 9 };

export function resetEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const html = shell({
    title: RESET_SUBJECT,
    preheader: PREHEADER,
    content: hero({
      lit: LIT,
      headline: "Pick up where you left off.",
      copy: "Someone asked to reset the password on this address. Choose a new one and your grid is waiting exactly as you left it. The link works once and expires after an hour.",
      cta: button(url, "Choose a new password"),
    }),
  });

  const text = [
    "Pick up where you left off.",
    "",
    "Someone asked to reset the password on this address. Choose a new one and",
    "your grid is waiting exactly as you left it. The link works once and",
    "expires after an hour.",
    "",
    "Choose a new password:",
    url,
    "",
    "Didn't ask for this? Ignore it and nothing happens — the password on the",
    "account is unchanged until the link above is used.",
    "",
    "OpenHabits · daily quotes & habits",
  ].join("\n");

  return { subject: RESET_SUBJECT, html, text };
}
