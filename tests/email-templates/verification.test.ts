import { describe, expect, it } from "vitest";
import { verificationEmail } from "@/lib/email-templates/verification";

const URL =
  "https://openhabits.app/api/auth/verify-email?token=abc123&callbackURL=/";

describe("verificationEmail", () => {
  it("puts the link in both parts", () => {
    const { html, text } = verificationEmail(URL);
    // The href is attribute-escaped; the plain-text part is not, and must not be.
    expect(html).toContain(
      'href="https://openhabits.app/api/auth/verify-email?token=abc123&amp;callbackURL=/"',
    );
    expect(text).toContain(URL);
  });

  it("escapes a URL that would otherwise break out of the attribute", () => {
    const { html } = verificationEmail(
      'https://openhabits.app/?t=x"><script>alert(1)</script>',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("draws the grid as table cells, with exactly one day lit", () => {
    const { html } = verificationEmail(URL);
    const empty = html.match(/background-color:#ebedf0/g) ?? [];
    const lit = html.match(/background-color:#30a14e/g) ?? [];
    expect(lit).toHaveLength(1);
    expect(empty).toHaveLength(7 * 10 - 1);
    expect(html).not.toContain("<img");
  });

  it("ships a plain-text alternative", () => {
    const { text } = verificationEmail(URL);
    expect(text).not.toContain("<");
    expect(text.length).toBeGreaterThan(80);
  });
});
