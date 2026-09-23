// ================================================================================
// CAPTURE BACKEND - Web UI per-button bitmap extraction
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/capture/screenshot.js
// Purpose: Loads the Companion tablet web UI (`tablet.html?page=N`) and pulls
//          each button's actual rendered bitmap directly out of the DOM —
//          non-invasive, doesn't touch Companion's control state.
// Dependencies: playwright
//
// FINDING (2026-09-22, confirmed against a live 4.3.4 instance): the tablet
// view renders each button as a `.button-control` element with
// `title="Button <page>/<row>/<col>"` and the button's bitmap inlined as a
// `background-image: url("data:image/png;base64,...")` CSS style. This means
// per-button images can be extracted directly from the DOM — no screenshot
// cropping needed, and no dependency on the Satellite API's subscription
// feature (which requires an explicit opt-in setting in Companion).
//
// VIRTUALIZATION GOTCHA (confirmed 2026-09-22, revised same day after a
// multi-page scrape surfaced a deeper bug): the tablet view is ONE
// continuous scroller across ALL pages, not a per-page view — `?page=N` in
// the URL does NOT jump there; every load starts at the top (page 1) and
// you have to scroll down through page 1, 2, 3... to reach page N. Rows
// within a page also virtualize (a `.page-in-view-tester` element gates
// what's rendered), so even the target page's own rows may not all be
// mounted at once.
//
// This means the scroll loop can spend many steps scrolling through EARLIER
// pages with zero target-page buttons in the DOM before it ever reaches the
// target page — watching only target-page button count for convergence is
// wrong, because "no new target-page buttons yet" is the expected state
// while still scrolling through page 1/2/3 on the way to page 40. The
// initial version of this code did exactly that and silently captured 0
// buttons for every page past the first few. Convergence is now judged by
// the TOTAL button count across all pages currently in the DOM (i.e. "has
// scrolling stopped revealing anything new at all"), while target-page
// buttons are accumulated into `found` throughout the whole scroll, not
// just at the end.
//
// PERFORMANCE NOTE: launching Chromium is expensive (~1s+). Capturing many
// pages (see src/scrape.js) reuses one browser across all of them via
// `captureManyPages` instead of relaunching per page.
//
// CLASSIC (pre-4.x) COMPANION UI (confirmed 2026-09-23 against a real 3.0.0
// instance): a completely different tablet.html DOM — no `.button-control`
// virtualized scroller at all. Buttons are flat `.bank img` elements (inside
// `.bank-border`, inside a `.bank.clickable`), ALL rendered into the DOM at
// once with no scrolling required, `alt="Button N"` where N resets to 1 at
// the start of each page (not a global index), and the bitmap is the img's
// own `src` — often `image/bmp`, not `image/png`. A scrape against this kind
// of instance previously silently captured zero buttons on every page,
// because the code only ever looked for `.button-control`. Detected by
// checking which selector is present after the first page load; the grid
// shape (columns) is measured from real bounding-box rows rather than
// hardcoded, since older Companion configs aren't all the same bank size.
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

export function extForDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:image\/([a-z0-9]+);base64,/);
  return match ? `.${match[1]}` : ".png";
}

/**
 * Pure chunking/geometry logic for the classic grid, split out from the
 * browser-coupled `$$eval` call so it's unit-testable without a real page.
 * @param {{alt:string, src:string, top:number}[]} raw - DOM order
 * @returns {{row:number, col:number, dataUrl:string}[][]} one array per page
 */
export function chunkClassicGrid(raw) {
  const chunks = [];
  let current = [];
  for (const btn of raw) {
    const n = Number((btn.alt.match(/Button (\d+)/) ?? [])[1]);
    if (!n) continue;
    if (n === 1 && current.length) {
      chunks.push(current);
      current = [];
    }
    current.push(btn);
  }
  if (current.length) chunks.push(current);

  return chunks.map((chunk) => {
    // columns = how many buttons share the first row's top offset
    const firstTop = chunk[0].top;
    let cols = chunk.findIndex((b) => b.top !== firstTop);
    if (cols <= 0) cols = chunk.length; // single row
    return chunk.map((b, i) => ({
      row: Math.floor(i / cols),
      col: i % cols,
      dataUrl: b.src,
    }));
  });
}

/**
 * Detects which Companion tablet UI generation is loaded on the current
 * page — "modern" (4.x's `.button-control` virtualized scroller), "classic"
 * (pre-4.x's flat `.bank img` grid), or "unknown" if neither is present
 * (e.g. the page failed to load, or a future/unrecognized UI). Never
 * guesses silently past "unknown" — callers should fail loudly rather than
 * capture zero buttons without telling anyone why.
 */
async function detectUiKind(browserPage) {
  return browserPage.evaluate(() => {
    if (document.querySelector(".button-control")) return "modern";
    if (document.querySelector(".bank img")) return "classic";
    return "unknown";
  });
}

/**
 * Extracts every button from the CLASSIC (pre-4.x) Companion tablet UI —
 * flat `.bank img` elements, no scrolling/virtualization. Returns them
 * chunked by page in DOM order (each chunk's own `alt="Button N"` sequence
 * restarts at 1), with row/col derived from measured grid columns rather
 * than assumed.
 *
 * @param {import("playwright").Page} browserPage
 * @returns {Promise<{row:number, col:number, dataUrl:string}[][]>} one array per page, in DOM order
 */
async function extractClassicGrid(browserPage) {
  const raw = await browserPage.$$eval(".bank img", (imgs) =>
    imgs.map((img) => ({
      alt: img.alt,
      src: img.src,
      top: img.getBoundingClientRect().top,
    }))
  );
  return chunkClassicGrid(raw);
}

/**
 * Extracts every button on one page from an already-open Playwright page
 * object by scrolling the (virtualized) container and merging DOM snapshots
 * until nothing new appears. Does not launch or close a browser.
 *
 * @param {import("playwright").Page} browserPage
 * @param {object} opts
 * @param {string} opts.url
 * @param {number} opts.page
 * @param {number} [opts.maxScrollSteps]
 * @returns {Promise<Map<string, {row:number, col:number, dataUrl:string}>>}
 */
async function writeButtonImages(found, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const written = [];
  for (const { row, col, dataUrl } of found.values()) {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const filePath = path.join(outDir, `${row}-${col}${extForDataUrl(dataUrl)}`);
    await fs.writeFile(filePath, Buffer.from(base64, "base64"));
    written.push({ row, col, path: filePath });
  }
  return written;
}

/**
 * One continuous scroll through the ENTIRE multi-page scroller, collecting
 * every button of every page it passes as it goes — since `?page=N` doesn't
 * actually jump anywhere, this is the only correct (and vastly faster) way
 * to capture many pages: one pass, not N separate scrolls-from-the-top.
 *
 * STOPPING CONDITION GOTCHA (confirmed 2026-09-22): this is a sliding-window
 * virtualization — the rendered `.button-control` COUNT stays roughly
 * constant as you scroll (old rows unmount as new ones mount), it does not
 * grow toward some total. Watching total button count for "have we stopped
 * seeing new content" is wrong and converges falsely after 1-2 steps. The
 * correct signal is the scroller's own `scrollTop` vs `scrollHeight` — keep
 * scrolling until `scrollTop + clientHeight >= scrollHeight` (confirmed:
 * `.scroller` reports a real scrollHeight, e.g. 78068px for a 99-page
 * instance, and scrollTop increases by clientHeight every step exactly as
 * expected — scrolling itself was never the problem).
 *
 * @param {import("playwright").Page} browserPage
 * @param {string} url - any tablet.html URL (page number in it is irrelevant)
 * @param {number} [maxScrollSteps] - safety cap in case scrollHeight is unreadable
 * @returns {Promise<Map<string, {page:number, row:number, col:number, dataUrl:string}>>}
 *   keyed by "page-row-col"
 */
async function extractAllPages(browserPage, url, maxScrollSteps = 500) {
  await browserPage.goto(url, { waitUntil: "networkidle" });

  const found = new Map();
  let steps = 0;

  while (steps <= maxScrollSteps) {
    const buttons = await browserPage.$$eval(".button-control", (els) =>
      els.map((el) => {
        const border = el.querySelector(".button-border");
        const title = border?.getAttribute("title") ?? "";
        const bg = border ? getComputedStyle(border).backgroundImage : "";
        const match = bg.match(/url\("(data:image\/[a-z]+;base64,[^"]+)"\)/);
        return { title, dataUrl: match ? match[1] : null };
      })
    );

    for (const { title, dataUrl } of buttons) {
      if (!dataUrl) continue;
      const loc = title.match(/Button (\d+)\/(\d+)\/(\d+)/);
      if (!loc) continue;
      const [, btnPage, row, col] = loc;
      found.set(`${btnPage}-${row}-${col}`, { page: Number(btnPage), row: Number(row), col: Number(col), dataUrl });
    }

    const metrics = await browserPage.evaluate(() => {
      const el = document.querySelector(".scroller");
      if (!el) return null;
      return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    if (!metrics || metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 2) break; // hit true bottom

    await browserPage.evaluate(() => {
      const scroller = document.querySelector(".scroller");
      if (scroller) scroller.scrollTop += scroller.clientHeight;
    });
    await browserPage.waitForTimeout(250);
    steps++;
  }

  return found;
}

/**
 * Single-page convenience wrapper — launches its own browser, captures one
 * page, closes the browser. Fine for one-off CLI use; for capturing many
 * pages in one scrape, use `captureManyPages` instead (one browser launch
 * total, not one per page).
 *
 * @param {object} opts
 * @param {string} opts.url - full URL to the Companion tablet page, e.g.
 *   `http://<host>:8000/tablet.html?page=1`. Required, never guessed.
 * @param {string} opts.outDir - directory to write `<row>-<col>.png` files into
 * @param {number} opts.page - Companion page number
 * @param {number} [opts.maxScrollSteps]
 */
export async function captureScreenshotPage({ url, outDir, page, maxScrollSteps }) {
  if (!url) {
    throw new Error("captureScreenshotPage requires an explicit url — never auto-discovered");
  }
  const browser = await chromium.launch();
  try {
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await browserPage.goto(url, { waitUntil: "networkidle" });
    const kind = await detectUiKind(browserPage);
    if (kind === "unknown") {
      throw new Error(`Could not recognize this Companion tablet UI's DOM at ${url} — neither the modern (.button-control) nor classic (.bank img) button layout was found. The page may have failed to load, or this is an unsupported Companion version.`);
    }

    if (kind === "classic") {
      const chunks = await extractClassicGrid(browserPage);
      const found = new Map(chunks[0]?.map((b) => [`${b.row}-${b.col}`, b]) ?? []);
      const written = await writeButtonImages(found, outDir);
      return { page, buttons: written };
    }

    const all = await extractAllPages(browserPage, url, maxScrollSteps);
    const found = new Map();
    for (const [key, btn] of all) {
      if (btn.page === page) found.set(key, btn);
    }
    const written = await writeButtonImages(found, outDir);
    return { page, buttons: written };
  } finally {
    await browser.close();
  }
}

/**
 * Captures every requested page in ONE continuous scroll pass through
 * Companion's tablet UI (one browser launch, one page load, one scroll-
 * through) — used by `scrapeDevice` for a full-instance scrape. Far faster
 * than looping a per-page scroll-from-the-top capture, and the only
 * correct approach given `?page=N` doesn't actually jump to that page.
 *
 * @param {object} opts
 * @param {{page:number, url:string, outDir:string}[]} opts.pages - `url` only
 *   needs to be valid (any tablet.html URL); the target page numbers come
 *   from the `page` field on each entry.
 * @param {(msg:string)=>void} [opts.onProgress]
 * @param {number} [opts.maxScrollSteps]
 * @returns {Promise<{page:number, buttons:{row:number,col:number,path:string}[]}[]>}
 */
export async function captureManyPages({ pages, onProgress, maxScrollSteps }) {
  if (!pages.length) return [];
  const browser = await chromium.launch();
  try {
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await browserPage.goto(pages[0].url, { waitUntil: "networkidle" });
    const kind = await detectUiKind(browserPage);
    if (kind === "unknown") {
      throw new Error(`Could not recognize this Companion tablet UI's DOM at ${pages[0].url} — neither the modern (.button-control) nor classic (.bank img) button layout was found. The page may have failed to load, or this is an unsupported Companion version.`);
    }

    if (kind === "classic") {
      onProgress?.("Classic (pre-4.x) Companion UI detected — no scroll virtualization, reading the full flat button grid in one pass...");
      const chunks = await extractClassicGrid(browserPage);
      const results = [];
      for (let i = 0; i < pages.length; i++) {
        const { page, outDir } = pages[i];
        const found = new Map((chunks[i] ?? []).map((b) => [`${b.row}-${b.col}`, b]));
        const written = await writeButtonImages(found, outDir);
        results.push({ page, buttons: written });
        onProgress?.(`  page ${page}: ${written.length} buttons`);
      }
      if (chunks.length !== pages.length) {
        onProgress?.(`  note: the classic UI rendered ${chunks.length} page(s) of buttons but the config export listed ${pages.length} — extra/missing pages were not captured.`);
      }
      return results;
    }

    onProgress?.("Scrolling through the full instance in one pass...");
    const all = await extractAllPages(browserPage, pages[0].url, maxScrollSteps);

    const results = [];
    for (const { page, outDir } of pages) {
      const pageButtons = new Map();
      for (const [key, btn] of all) {
        if (btn.page === page) pageButtons.set(key, btn);
      }
      const written = await writeButtonImages(pageButtons, outDir);
      results.push({ page, buttons: written });
      onProgress?.(`  page ${page}: ${written.length} buttons`);
    }
    return results;
  } finally {
    await browser.close();
  }
}
