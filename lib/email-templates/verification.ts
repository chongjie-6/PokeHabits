/**
 * The verification email — the first thing OpenHabits ever says to a new
 * account. The chrome it sits in lives in `layout.ts`.
 */

import { button, hero, shell } from "./layout";

export const VERIFICATION_SUBJECT = "One square from day one";

/** Shown after the subject in the inbox list, then hidden in the body. */
const PREHEADER =
  "Verify your address and OpenHabits starts keeping your grid.";

/** Day one: early in the fortnight, and the only square that is lit. */
const LIT = { row: 3, column: 6 };

export function verificationEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const html = shell({
    title: VERIFICATION_SUBJECT,
    preheader: PREHEADER,
    content: hero({
      lit: LIT,
      headline: "One square from day one.",
      copy: "OpenHabits keeps a square for every day of the year. Verify this address and the grid above becomes yours &mdash; on your phone, your laptop, and anywhere else you sign in.",
      cta: button(url, "Verify and start today"),
    }),
  });

  const text = [
    "One square from day one.",
    "",
    "OpenHabits keeps a square for every day of the year. Verify this address and",
    "the grid becomes yours — on your phone, your laptop, and anywhere else",
    "you sign in.",
    "",
    "Verify and start today:",
    url,
    "",
    "Didn't ask for this? Ignore it and nothing happens.",
    "",
    "OpenHabits · daily quotes & habits",
  ].join("\n");

  return { subject: VERIFICATION_SUBJECT, html, text };
}
