/**
 * Records the short demo GIF into docs/media/: a morning's ticks, the year grid,
 * and the share card the app draws from it. The README carries promo.mjs's
 * longer cut now, so nothing references this one's output — it is the three-beat
 * version, kept for anywhere that wants a loop rather than a reel. Same setup as
 * shoot.mjs, plus two encoders it does not need:
 *
 *   npm run build && npx next start -p 3210
 *   npm i --no-save puppeteer-core gifenc pngjs
 *   node scripts/screenshots/seed.mjs
 *   node scripts/screenshots/demo.mjs
 *
 * Every frame is a screenshot of the real app driven through its own buttons.
 * Two things are staged on top and nothing else: a tap marker, because a GIF
 * cannot show a finger, and the grid's cells are blanked and revealed week by
 * week, because a year of data arrives in one import rather than over a year.
 *
 * Frames are captured as discrete states under reduced motion rather than as a
 * screencast: a screenshot takes longer than the app's animations, so recording
 * them would capture a random point in each.
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
      // The viewport, not a clip: a clip is in document coordinates and would
      // stay pinned to the top of the page through every scroll.
      const png = await page.screenshot();
      const { data, width, height } = PNG.sync.read(png);
      frames.push({ data, width, height, delay });
    },
  };
}

/** Where a selector's centre is, in viewport coordinates. */
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

/** Marker on, frame, click, marker off, frame. */
async function tap(page, rec, handle, { hold = 900 } = {}) {
  const at = await centre(page, handle);
  await showTap(page, at);
  await rec.shot(260);
  await hideTap(page);
  await handle.click();
  await sleep(250);
  if (hold) await rec.shot(hold);
}

const habitButton = (page, name) =>
  page.evaluateHandle(
    (n) =>
      document.querySelector(
        `button[aria-label^="${n}:"], button[aria-label^="${n},"]`,
      ),
    name,
  );

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
  await rec.shot(1400);

  for (const name of ["Meditate", "Journal", "Water", "Water", "Stretch"]) {
    const button = await habitButton(page, name);
    if (!(await button.evaluate((b) => b !== null))) continue;
    await button.evaluate((b) => b.scrollIntoView({ block: "nearest" }));
    await tap(page, rec, button.asElement());
  }
  await rec.shot(900);

  const statsTab = await page.evaluateHandle(() =>
    document.querySelector('nav a[href="/stats"]'),
  );
  await tap(page, rec, statsTab.asElement(), { hold: 0 });
  await page.waitForSelector("main svg rect[data-date]");
  await sleep(700);

  // Blank the grid and let the weeks arrive one row at a time — rows, because a
  // phone draws the year transposed (components/Heatmap.tsx).
  const rows = await page.evaluate(() => {
    const groups = [...document.querySelectorAll("main svg g[role=row]")];
    // The legend's "Less" swatch is levelColor(0), resolved; copying it keeps
    // blank cells identical to an empty day rather than a guess at one.
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
  await rec.shot(500);
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
    await rec.shot(70);
  }
  rec.frames.at(-1).delay = 1500;

  // A phone shows 19 weeks until asked, and the card is drawn from the weeks on
  // screen — expand first, or the image says "my year" over four months.
  const button = (label) =>
    page.evaluateHandle(
      (l) =>
        [...document.querySelectorAll("button")].find((b) =>
          b.textContent.trim().includes(l),
        ),
      label,
    );
  const expand = await button("Show full year");
  await expand.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await sleep(200);
  await tap(page, rec, expand.asElement(), { hold: 0 });
  await sleep(500);

  const share = await button("Share");
  await share.evaluate((b) => b.scrollIntoView({ block: "end" }));
  await page.evaluate(() => window.scrollBy(0, 120));
  await sleep(300);
  await rec.shot(900);
  await tap(page, rec, share.asElement(), { hold: 150 });
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

  // The card is the app's own PNG, shown on the app's own ground: a still frame
  // is the honest way to present a file the share sheet would have received.
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
  await stageRec.shot(3000);
  rec.frames.push(...stageRec.frames);

  await stage.close();
  await page.close();
  return rec.frames;
}

/**
 * One global palette, and every pixel unchanged since the previous frame written
 * as transparent: the UI holds still between taps, and runs of one index are what
 * LZW compresses to almost nothing.
 */
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

for (const theme of ["light", "dark"]) {
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
  const file = new URL(`demo-${theme}.gif`, OUT);
  writeFileSync(file, bytes);
  console.log(
    `demo-${theme}.gif  ${frames.length} frames, ${(bytes.length / 1024).toFixed(0)} KB`,
  );
}

await browser.close();
