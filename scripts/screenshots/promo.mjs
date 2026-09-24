/**
 * Records the README banner and launch-post reel into docs/media/: a morning's
 * ticks, the same ticks with the network genuinely off, the year grid, the
 * share card, the three designs and a repainted palette — one scene per claim
 * the post makes.
 *
 *   npm run build && npx next start -p 3210
 *   npm i --no-save puppeteer-core gifenc pngjs
 *   node scripts/screenshots/seed.mjs
 *   node scripts/screenshots/promo.mjs
 *
 * Deliberately a copy of demo.mjs's harness rather than an import of it: the
 * two are cut to different lengths for different places, and a shared module
 * would make every re-cut of one a re-cut of the other.
 *
 * The staging rules are demo.mjs's, plus one: the airplane pill is a caption on
 * a real condition, not a prop. `setOfflineMode(true)` is on for those frames,
 * so what the pill claims is what the browser is actually doing.
 */
import puppeteer from "puppeteer-core";
import gifenc from "gifenc";
import pngjs from "pngjs";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3210";
const OUT = new URL("../../docs/media/", import.meta.url);
const BACKUP = fileURLToPath(new URL("./backup.json", import.meta.url));

const W = 390;
const H = 760;
const SCALE = 1.5;

/** How long a tap marker sits on screen before the press lands. */
const MARK = 180;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  const input = await page.waitForSelector('input[type="file"]');
  await input.uploadFile(BACKUP);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Replace",
    ),
  );
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

function recorder(page) {
  const frames = [];
  return {
    frames,
    async shot(delay) {
      const png = await page.screenshot();
      const { data, width, height } = PNG.sync.read(png);
      frames.push({ data, width, height, delay });
    },
  };
}

const centre = (page, handle) =>
  page.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, handle);

const showTap = (page, { x, y }) =>
  page.evaluate(
    (x, y) => {
      const dot = document.createElement("div");
      dot.id = "__tap";
      Object.assign(dot.style, {
        position: "fixed",
        left: `${x - 22}px`,
        top: `${y - 22}px`,
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        background: "rgba(128,128,128,.28)",
        border: "2px solid rgba(128,128,128,.55)",
        pointerEvents: "none",
        zIndex: 2147483647,
      });
      document.body.appendChild(dot);
    },
    x,
    y,
  );

const hideTap = (page) =>
  page.evaluate(() => document.getElementById("__tap")?.remove());

async function tap(page, rec, handle, { hold = 650 } = {}) {
  const at = await centre(page, handle);
  await showTap(page, at);
  await rec.shot(MARK);
  await hideTap(page);
  await handle.click();
  await sleep(250);
  if (hold) await rec.shot(hold);
}

/** Caption pill, pinned above the tab bar so it never sits on a habit row. */
const showPill = (page, label) =>
  page.evaluate((text) => {
    const el = document.createElement("div");
    el.id = "__pill";
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      bottom: "84px",
      transform: "translateX(-50%)",
      padding: "7px 14px",
      borderRadius: "999px",
      whiteSpace: "nowrap",
      background: "rgba(20,20,20,.86)",
      color: "#fff",
      zIndex: 2147483646,
      font: "600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
      boxShadow: "0 6px 20px rgba(0,0,0,.28)",
    });
    document.body.appendChild(el);
  }, label);

const hidePill = (page) =>
  page.evaluate(() => document.getElementById("__pill")?.remove());

/**
 * The first row that is not already done. Named habits are the wrong handle
 * here: the seed finishes some of today, and tapping one of those records a
 * tick that clears a box — which under the offline pill would be a caption
 * claiming the opposite of what the frame shows. A counted habit stays undone
 * until its target, so repeating this walks Water up rather than past it.
 */
const firstUndone = (page) =>
  page.evaluateHandle(() =>
    [...document.querySelectorAll("button[aria-pressed]")].find(
      // The daily card's favourite heart is a toggle too, and it sits above the
      // list — without the <figure> test the reel opens by saving a quote.
      (b) => b.getAttribute("aria-pressed") === "false" && !b.closest("figure"),
    ),
  );

const tabLink = (page, href) =>
  page.evaluateHandle(
    (h) => document.querySelector(`nav a[href="${h}"]`),
    href,
  );

const byText = (page, label) =>
  page.evaluateHandle(
    (l) =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.trim().includes(l),
      ),
    label,
  );

/** The skin buttons share their markup with Theme — scope to the Design fieldset. */
const skinButton = (page, label) =>
  page.evaluateHandle((l) => {
    const set = [...document.querySelectorAll("fieldset")].find(
      (f) => f.querySelector("legend")?.textContent.trim() === "Design",
    );
    return [...set.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === l,
    );
  }, label);

/** Re-queried each time: the 700ms hold in lib/today-split.ts moves rows between taps. */
async function tapUndone(page, rec, count) {
  for (let i = 0; i < count; i++) {
    const button = await firstUndone(page);
    if (!(await button.evaluate((b) => b !== undefined))) return;
    await button.evaluate((b) => b.scrollIntoView({ block: "nearest" }));
    await tap(page, rec, button.asElement());
  }
}

async function record(browser, theme) {
  const page = await browser.newPage();
  await page.setViewport({
    width: W,
    height: H,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
  });
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
    delete Navigator.prototype.share;
    delete Navigator.prototype.canShare;
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
  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem("hapi-theme", t);
    localStorage.removeItem("hapi-skin");
    localStorage.removeItem("hapi-palette");
  }, theme);
  await seed(page);

  const rec = recorder(page);

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("figure blockquote");
  await sleep(600);
  await rec.shot(900);

  await tapUndone(page, rec, 3);
  await rec.shot(350);

  // The claim the whole post rests on, proved rather than asserted: Chrome is
  // offline for these frames, and the ticks land at the same speed.
  await page.setOfflineMode(true);
  await showPill(page, "Airplane mode — network off");
  await rec.shot(1000);
  await tapUndone(page, rec, 2);
  await rec.shot(1100);
  await hidePill(page);
  await page.setOfflineMode(false);

  const stats = await tabLink(page, "/stats");
  await tap(page, rec, stats.asElement(), { hold: 0 });
  await page.waitForSelector("main svg rect[data-date]");
  await sleep(700);

  const rows = await page.evaluate(() => {
    const groups = [...document.querySelectorAll("main svg g[role=row]")];
    const swatch = document.querySelector("main .surface-card span.rounded-xs");
    const empty = getComputedStyle(swatch).backgroundColor;
    for (const g of groups) {
      for (const r of g.querySelectorAll("rect")) {
        r.dataset.fill = r.getAttribute("fill");
        r.setAttribute("fill", empty.trim());
      }
    }
    return groups.length;
  });
  await rec.shot(350);
  const per = Math.max(1, Math.ceil(rows / 16));
  for (let shown = per; shown < rows + per; shown += per) {
    await page.evaluate((n) => {
      [...document.querySelectorAll("main svg g[role=row]")]
        .slice(0, n)
        .forEach((g) => {
          for (const r of g.querySelectorAll("rect"))
            if (r.dataset.fill) r.setAttribute("fill", r.dataset.fill);
        });
    }, shown);
    await rec.shot(55);
  }
  rec.frames.at(-1).delay = 1000;

  const expand = await byText(page, "Show full year");
  await expand.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await sleep(200);
  await tap(page, rec, expand.asElement(), { hold: 0 });
  await sleep(500);

  const share = await byText(page, "Share");
  await share.evaluate((b) => b.scrollIntoView({ block: "end" }));
  await page.evaluate(() => window.scrollBy(0, 120));
  await sleep(300);
  await rec.shot(450);
  await tap(page, rec, share.asElement(), { hold: 120 });
  await page.waitForFunction(() => window.__blobs.length > 0, {
    timeout: 20000,
  });
  const dataUrl = await page.evaluate(
    () =>
      new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(window.__blobs[0]);
      }),
  );
  const colours = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const v = (name) => s.getPropertyValue(name).trim();
    return {
      bg: v("--background"),
      muted: v("--muted"),
      border: v("--border"),
    };
  });
  const stage = await browser.newPage();
  await stage.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await stage.setContent(`
    <body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:${colours.bg};font:500 13px -apple-system,Segoe UI,Roboto,sans-serif;color:${colours.muted}">
      <img src="${dataUrl}" style="width:354px;border-radius:10px;border:1px solid ${colours.border};box-shadow:0 12px 40px rgba(0,0,0,.22)">
      <div>Your year, as one image</div>
    </body>`);
  await stage.waitForFunction(() => document.images[0].complete);
  const stageRec = recorder(stage);
  await stageRec.shot(1700);
  rec.frames.push(...stageRec.frames);
  await stage.close();

  // Designs and palette last, so the reel ends on the app looking like someone
  // else's rather than on a screenshot of a file.
  for (const skin of ["Grid", "Blocks"]) {
    const settingsTab = await tabLink(page, "/settings");
    await tap(page, rec, settingsTab.asElement(), { hold: 0 });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("legend")].some(
        (l) => l.textContent.trim() === "Design",
      ),
    );
    await sleep(300);
    const choice = await skinButton(page, skin);
    await choice.evaluate((b) => b.scrollIntoView({ block: "center" }));
    await sleep(200);
    await tap(page, rec, choice.asElement(), { hold: 450 });
    const todayTab = await tabLink(page, "/");
    await tap(page, rec, todayTab.asElement(), { hold: 0 });
    await sleep(700);
    await rec.shot(1050);
  }

  const settingsTab = await tabLink(page, "/settings");
  await tap(page, rec, settingsTab.asElement(), { hold: 0 });
  await page.waitForSelector('a[href="/settings/colours"]');
  await sleep(300);
  const colourLink = await page.evaluateHandle(() =>
    document.querySelector('a[href="/settings/colours"]'),
  );
  await colourLink.evaluate((a) => a.scrollIntoView({ block: "center" }));
  await sleep(200);
  await tap(page, rec, colourLink.asElement(), { hold: 0 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Ember",
    ),
  );
  await sleep(500);
  await rec.shot(500);
  const ember = await byText(page, "Ember");
  await ember.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await sleep(200);
  await tap(page, rec, ember.asElement(), { hold: 900 });
  const homeTab = await tabLink(page, "/");
  await tap(page, rec, homeTab.asElement(), { hold: 0 });
  await sleep(700);
  await rec.shot(1700);

  await page.close();
  return rec.frames;
}

function encode(frames) {
  const { width, height } = frames[0];
  const sample = new Uint8Array(
    Math.ceil((frames.length * (width * height)) / 16) * 4,
  );
  let o = 0;
  for (const f of frames) {
    for (let i = 0; i < f.data.length && o < sample.length; i += 64) {
      sample[o++] = f.data[i];
      sample[o++] = f.data[i + 1];
      sample[o++] = f.data[i + 2];
      sample[o++] = 255;
    }
  }
  const palette = quantize(sample.subarray(0, o), 255, { format: "rgb444" });
  const CLEAR = palette.length;
  palette.push([255, 0, 255]);

  const gif = GIFEncoder();
  let previous = null;
  frames.forEach((f, n) => {
    const index = applyPalette(f.data, palette.slice(0, CLEAR), "rgb444");
    const out = index.slice();
    if (previous) {
      for (let i = 0; i < out.length; i++)
        if (index[i] === previous[i]) out[i] = CLEAR;
    }
    gif.writeFrame(out, width, height, {
      palette: n === 0 ? palette : undefined,
      delay: f.delay,
      transparent: n > 0,
      transparentIndex: CLEAR,
      dispose: 1,
    });
    previous = index;
  });
  gif.finish();
  return gif.bytes();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
  ],
});

const themes = process.env.THEMES
  ? process.env.THEMES.split(",")
  : ["light", "dark"];
for (const theme of themes) {
  const frames = await record(browser, theme);
  if (process.env.FRAMES) {
    frames.forEach((f, i) => {
      const png = new PNG({ width: f.width, height: f.height });
      f.data.copy(png.data);
      writeFileSync(
        `${process.env.FRAMES}/${theme}-${String(i).padStart(2, "0")}.png`,
        PNG.sync.write(png),
      );
    });
  }
  const bytes = encode(frames);
  writeFileSync(new URL(`promo-${theme}.gif`, OUT), bytes);
  const seconds = frames.reduce((n, f) => n + f.delay, 0) / 1000;
  console.log(
    `promo-${theme}.gif  ${frames.length} frames, ${seconds.toFixed(1)}s, ${(bytes.length / 1024).toFixed(0)} KB`,
  );
}

await browser.close();
