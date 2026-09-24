/**
 * Screenshots the running app into docs/media/. Not wired into package.json:
 * it needs a browser this repo deliberately does not depend on.
 *
 *   npm run build && npx next start -p 3210
 *   npm i --no-save puppeteer-core
 *   node scripts/screenshots/seed.mjs      # writes backup.json beside this file
 *   node scripts/screenshots/shoot.mjs
 *
 * CHROME and OUT below are absolute paths; set them for your machine.
 *
 * Seeds a year of habits through the app's own Settings → Import backup path,
 * so what is captured is the real store rather than a fixture wired past it.
 * Each phone shot is fitted to its own content height — the tab bar is fixed to
 * the bottom of the viewport, so a viewport cut to the content puts the bar
 * directly under it with no dead band in between.
 */
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3210";
const OUT = "C:/Users/Chongjie/Desktop/hapi/docs/media/";
const BACKUP = fileURLToPath(new URL("./backup.json", import.meta.url));

const SHOTS = [
  { name: "today", path: "/", wait: "figure blockquote" },
  { name: "week", path: "/week", wait: "main" },
  // Stats runs well past a phone screen; cut it at the heatmap card rather than
  // through the middle of the weekday bars underneath it.
  { name: "stats", path: "/stats", wait: "main", stop: "main svg" },
  { name: "collection", path: "/quotes", wait: "main" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(BACKUP);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Merge",
    ),
  );
  // Replace, not merge: merge keeps the device's own settings, and the backup's
  // saved quotes are part of what these frames are showing.
  const click = (label) =>
    page.evaluate(
      (l) =>
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent.trim() === l)
          .click(),
      label,
    );
  await click("Replace");
  await click("Yes, replace everything");
  await page.waitForFunction(() =>
    /Replaced everything with \d+ habits/.test(document.body.innerText),
  );
  await sleep(400);
}

/** Content height plus the fixed tab bar, clamped to something phone-shaped. */
async function fit(page, stop) {
  const h = await page.evaluate((stopSel) => {
    if (stopSel) {
      const el = document.querySelector(stopSel);
      const card = el && (el.closest(".surface-card") || el);
      const nav = document.querySelector("nav");
      if (card) {
        return Math.ceil(
          card.getBoundingClientRect().bottom +
            window.scrollY +
            (nav ? nav.getBoundingClientRect().height : 0) +
            16,
        );
      }
    }
    const main = document.querySelector("main");
    const nav = document.querySelector("nav");
    let bottom = 0;
    for (const el of main.querySelectorAll("*")) {
      // A closed <dialog> — the habit form's bottom sheet — still has layout,
      // and it is taller than the page it is not showing on.
      if (el.closest("dialog")) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0)
        bottom = Math.max(bottom, r.bottom + window.scrollY);
    }
    return Math.ceil(
      bottom + (nav ? nav.getBoundingClientRect().height : 0) + 20,
    );
  }, stop);
  return Math.max(620, Math.min(h, 1180));
}

const phone = (height) => ({
  width: 390,
  height,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
  ],
  defaultViewport: phone(844),
});

for (const theme of ["light", "dark"]) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: theme },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  // Shoot the app as it looks installed — CDP has no display-mode override, and
  // an "add to home screen" card is not what these frames are about.
  await page.evaluateOnNewDocument(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /display-mode/.test(q)
        ? {
            matches: true,
            media: q,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent: () => false,
          }
        : real(q);
  });
  await page.evaluateOnNewDocument(
    (t) => localStorage.setItem("hapi-theme", t),
    theme,
  );
  await seed(page);

  // Save today's card, so the quote shows its filled state.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("figure blockquote");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /save/i.test(x.getAttribute("aria-label") || ""),
    );
    if (b && b.getAttribute("aria-pressed") !== "true") b.click();
  });
  await sleep(300);

  for (const shot of SHOTS) {
    await page.setViewport(phone(844));
    await page.goto(BASE + shot.path, { waitUntil: "networkidle0" });
    await page.waitForSelector(shot.wait);
    await sleep(600);
    const height = await fit(page, shot.stop);
    await page.setViewport(phone(height));
    await sleep(500);
    await page.screenshot({ path: `${OUT}${shot.name}-${theme}.png` });
    console.log(`${shot.name}-${theme}.png  390x${height}`);
  }

  await page.close();
}

// The year deserves the room a phone cannot give it: the heatmap card alone, wide.
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 1000, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: theme },
  ]);
  await page.evaluateOnNewDocument(
    (t) => localStorage.setItem("hapi-theme", t),
    theme,
  );
  await seed(page);

  await page.evaluateOnNewDocument(() => {
    delete Navigator.prototype.share;
    delete Navigator.prototype.canShare;
    // Keep the Blob itself rather than its URL: the app revokes the URL on the
    // line after the click, and a revoked blob: URL cannot be fetched back.
    window.__blobs = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => {
      window.__blobs.push(b);
      return create(b);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) click.call(this);
    };
  });

  await page.goto(`${BASE}/stats`, { waitUntil: "networkidle0" });
  await page.waitForSelector("main svg");
  await sleep(900);

  const card = await page.evaluateHandle(() =>
    document.querySelector("main svg").closest(".surface-card"),
  );
  await card.asElement().screenshot({ path: `${OUT}year-${theme}.png` });
  console.log(`year-${theme}.png`);

  // The share card is drawn by the app itself; headless Chrome has no
  // navigator.share, so the button falls through to a download.
  if (theme === "light") {
    await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => /Share/.test(b.textContent))
        .click(),
    );
    await page.waitForFunction(() => window.__blobs.length > 0, {
      timeout: 20000,
    });
    const dataUrl = await page.evaluate(async () => {
      const blob = window.__blobs[0];
      return await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(blob);
      });
    });
    writeFileSync(
      `${OUT}share-card.png`,
      Buffer.from(dataUrl.split(",")[1], "base64"),
    );
    console.log("share-card.png");
  }

  await page.close();
}

// The three skins, on the screen that differs most between them: the daily card
// and the tick target are redrawn per skin, the tokens underneath are not.
// `Ocean` is applied through the palette editor's own preset button, so the
// fourth frame is a real custom palette rather than a recoloured screenshot.
for (const variant of [
  { name: "skin-grid", skin: "grid" },
  { name: "skin-blocks", skin: "blocks" },
  { name: "palette-editor", skin: null, preset: "Ocean" },
]) {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.evaluateOnNewDocument(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /display-mode/.test(q)
          ? {
              matches: true,
              media: q,
              onchange: null,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              dispatchEvent: () => false,
            }
          : real(q);
    });
    // Pages in one browser context share an origin's localStorage, so the
    // previous variant's skin is still set here unless it is cleared.
    await page.evaluateOnNewDocument(
      (t, sk, keepPalette) => {
        localStorage.setItem("hapi-theme", t);
        if (sk) localStorage.setItem("hapi-skin", sk);
        else localStorage.removeItem("hapi-skin");
        // Not on a palette run: this fires on every navigation, and would wipe
        // the palette the editor just wrote on the way to the next page.
        if (!keepPalette) localStorage.removeItem("hapi-palette");
      },
      theme,
      variant.skin,
      Boolean(variant.preset),
    );
    await seed(page);

    if (variant.preset) {
      await page.goto(`${BASE}/settings/colours`, {
        waitUntil: "networkidle0",
      });
      await page.waitForFunction(
        (l) =>
          [...document.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === l,
          ),
        {},
        variant.preset,
      );
      await page.evaluate(
        (l) =>
          [...document.querySelectorAll("button")]
            .find((b) => b.textContent.trim() === l)
            .click(),
        variant.preset,
      );
      await sleep(600);
    }

    if (!variant.preset) {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
      await page.waitForSelector("main");
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          /save/i.test(x.getAttribute("aria-label") || ""),
        );
        if (b && b.getAttribute("aria-pressed") !== "true") b.click();
      });
    }
    await sleep(700);
    const height = await fit(page);
    await page.setViewport(phone(height));
    await sleep(500);
    await page.screenshot({ path: `${OUT}${variant.name}-${theme}.png` });
    console.log(`${variant.name}-${theme}.png  390x${height}`);
    await page.close();
  }
}

await browser.close();
