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
// VIRTUALIZATION GOTCHA (confirmed 2026-09-22): the tablet view is a
// continuous multi-page scroller that virtualizes rows (a `.page-in-view-
// tester` element gates what's rendered) — loading `?page=N` only guarantees
// that page's TOP rows are in the DOM; rows further down the same page may
// not exist yet until scrolled into view. Confirmed by a real case: page 2
// had 28 configured buttons but only 16 (its top 2 rows) were in the DOM on
// initial load. `captureScreenshotPage` now scrolls the container in steps
// and merges results across scroll positions until no new buttons for the
// target page appear, instead of trusting the first DOM snapshot.
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Extracts every button's rendered bitmap from a Companion tablet-view page
 * by reading each `.button-control` element's inlined background-image data
 * URI directly out of the DOM. Scrolls through the (virtualized) container
 * and merges results until no new buttons for the target page show up, so
 * rows below the fold aren't silently missed.
 *
 * @param {object} opts
 * @param {string} opts.url - full URL to the Companion tablet page for a
 *   given page number, e.g. `http://<host>:8000/tablet.html?page=1`.
 *   Required, never guessed.
 * @param {string} opts.outDir - directory to write `<row>-<col>.png` files into
 * @param {number} opts.page - Companion page number (used to validate the
 *   `title="Button P/R/C"` attribute matches what was asked for)
 * @param {number} [opts.maxScrollSteps] - safety cap on scroll iterations (default 20)
 */
export async function captureScreenshotPage({ url, outDir, page, maxScrollSteps = 20 }) {
  if (!url) {
    throw new Error("captureScreenshotPage requires an explicit url — never auto-discovered");
  }

  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await browserPage.goto(url, { waitUntil: "networkidle" });

    const found = new Map(); // "row-col" -> {row,col,dataUrl}
    let previousSize = -1;
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
        if (Number(btnPage) !== page) continue;
        found.set(`${row}-${col}`, { row: Number(row), col: Number(col), dataUrl });
      }

      if (found.size === previousSize) break; // no new buttons this scroll — converged
      previousSize = found.size;

      await browserPage.evaluate(() => {
        const scroller = document.querySelector(".scroller");
        if (scroller) scroller.scrollTop += scroller.clientHeight;
      });
      await browserPage.waitForTimeout(300);
      steps++;
    }

    const written = [];
    for (const { row, col, dataUrl } of found.values()) {
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const filePath = path.join(outDir, `${row}-${col}.png`);
      await fs.writeFile(filePath, Buffer.from(base64, "base64"));
      written.push({ row, col, path: filePath });
    }

    return { page, buttons: written };
  } finally {
    await browser.close();
  }
}
