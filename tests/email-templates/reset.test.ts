import { describe, expect, it } from "vitest";
import { resetEmail } from "@/lib/email-templates/reset";
import { verificationEmail } from "@/lib/email-templates/verification";

const URL =
  "https://openhabits.app/api/auth/reset-password/abc123?callbackURL=/reset-password";

describe("resetEmail", () => {
  it("puts the link in both parts", () => {
    const { html, text } = resetEmail(URL);
    // The href is attribute-escaped; the plain-text part is not, and must not be.
    expect(html).toContain(
      'href="https://openhabits.app/api/auth/reset-password/abc123?callbackURL=/reset-password"',
    );
    expect(text).toContain(URL);
  });

  it("escapes a URL that would otherwise break out of the attribute", () => {
    const { html } = resetEmail(
      'https://openhabits.app/?t=x"><script>alert(1)</script>',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("names nobody and confirms nothing", () => {
    // Sent on request from an unauthenticated form, so it reaches people who did
    // not ask for it whenever someone types their address in. It must not
    // confirm that an account exists.
    const { html, text } = resetEmail(URL);
    for (const body of [html, text]) {
      expect(body).toContain("Someone asked");
      expect(body).not.toMatch(/your account (is|has|was)/i);
    }
  });

  it("says the link expires, in both parts", () => {
    const { html, text } = resetEmail(URL);
    expect(html).toContain("expires after an hour");
    expect(text).toContain("expires after an hour");
  });

  it("ships a plain-text alternative", () => {
    const { text } = resetEmail(URL);
    expect(text).not.toContain("<");
    expect(text.length).toBeGreaterThan(80);
  });
});

describe("the shared email shell", () => {
  it("gives both mails the same chrome", () => {
    // Two mails that look like two different senders is the smell a phishing
    // filter — and a person — reads as suspicious.
    const reset = resetEmail(URL).html;
    const verify = verificationEmail(URL).html;

    for (const html of [reset, verify]) {
      expect(html).toContain("OpenHabits &middot; daily quotes &amp; habits");
      expect(html).toContain("Didn&rsquo;t ask for this?");
      // Images are blocked by default in most clients; the artwork is table
      // cells, which nothing blocks.
      expect(html).not.toContain("<img");
    }
  });

  it("carries a dark palette without giving up the light one", () => {
    const { html } = resetEmail(URL);

    // §13.9: the media query is an enhancement. Clients that ignore `<style>`
    // keep the inline light values, so those have to still be there.
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain('content="light dark"');
    expect(html).not.toContain("light only");
    expect(html).toContain("background-color:#ffffff");
  });

  it("lights exactly one square, and a different one in each mail", () => {
    const lit = (html: string) =>
      (html.match(/background-color:#30a14e/g) ?? []).length;
    expect(lit(resetEmail(URL).html)).toBe(1);
    expect(lit(verificationEmail(URL).html)).toBe(1);

    // A beginning and a return: the verification mail lights a first day, this
    // one lights the day you came back.
    const cell = (html: string) => html.indexOf("background-color:#30a14e");
    expect(cell(resetEmail(URL).html)).not.toBe(
      cell(verificationEmail(URL).html),
    );
  });
});
