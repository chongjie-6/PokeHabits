import { type EmailKind, type Rendered, TEMPLATES } from "./email-templates";
import nodemailer from "nodemailer";

export { type EmailKind, isEmailKind } from "./email-templates";
export type EmailJob = { kind: EmailKind; to: string; url: string };

/** Whether mail is configured at all. Lets callers answer honestly rather than throw. */
export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER) && Boolean(process.env.SMTP_PASSWORD);
}

/**
 * Gmail rewrites this to the authenticated account unless the address is a
 * verified alias, so the fallback names the app around `SMTP_USER` rather than
 * inventing an address the relay would drop.
 */
function from(): string {
  // `||`, not `??`: `MAIL_FROM=` with nothing after it is `""`, not unset.
  return process.env.MAIL_FROM || `OpenHabits <${process.env.SMTP_USER}>`;
}

function client(): nodemailer.Transporter {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "SMTP configuration is incomplete. Outbound mail is unavailable; see .env.example.",
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
    /**
     * Nodemailer's defaults leave a stalled relay to the platform's own
     * timeout, which is how a slow Gmail becomes a slow sign-up — and on the
     * queued path a hang is worse than a failure, which would be retried.
     */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

async function sendMessage(
  to: string,
  { subject, html, text }: Rendered,
): Promise<void> {
  let info: nodemailer.SentMessageInfo;
  try {
    info = await client().sendMail({ from: from(), to, subject, html, text });
  } catch (cause) {
    throw new Error(`${subject}: send failed`, { cause });
  }

  // No address in the message: every caller logs this error.
  if (info.rejected?.length) {
    throw new Error(`${subject}: rejected by the server for the recipient`);
  }
}

export async function sendEmail({ kind, to, url }: EmailJob): Promise<void> {
  await sendMessage(to, TEMPLATES[kind](url));
}
