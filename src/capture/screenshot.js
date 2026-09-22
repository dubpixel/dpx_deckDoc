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
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

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
    const filePath = path.join(outDir, `${row}-${col}.png`);
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
