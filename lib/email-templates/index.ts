import { resetEmail } from "./reset";
import { verificationEmail } from "./verification";

export type Rendered = { subject: string; html: string; text: string };

/**
 * Every mail this app sends, by kind. `EmailKind`, the queue's validation and
 * both send paths read this table, so nothing downstream branches on a kind.
 */
export const TEMPLATES = {
  verification: verificationEmail,
  reset: resetEmail,
} satisfies Record<string, (url: string) => Rendered>;

export type EmailKind = keyof typeof TEMPLATES;

/** `Object.hasOwn` rather than `in`: `"constructor" in TEMPLATES` is true. */
export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && Object.hasOwn(TEMPLATES, value);
}
