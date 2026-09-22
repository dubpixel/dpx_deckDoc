// ================================================================================
// CAPTURE BACKEND - Web UI screenshot
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/capture/screenshot.js
// Purpose: Screenshots the Companion web UI's button grid, page by page, as a
//          non-invasive alternative to the Satellite API — doesn't subscribe
//          to or otherwise touch Companion's live control state.
// Dependencies: playwright
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Screenshots a single Companion "buttons" page from its web UI.
 *
 * @param {object} opts
 * @param {string} opts.url - full URL to the Companion buttons page for a
 *   given page number, e.g. `http://<host>:8000/tablet.html?page=1`.
 *   Required, never guessed — the web UI layout/routing can vary by
 *   Companion version, so the caller supplies the exact URL.
 * @param {string} opts.outDir - directory to write the page screenshot into
 * @param {string} [opts.gridSelector] - CSS selector for the button-grid
 *   element to screenshot; defaults to full page if not found
 * @param {number} opts.page - Companion page number, used for the output filename
 */
export async function captureScreenshotPage({ url, outDir, gridSelector, page }) {
  if (!url) {
    throw new Error("captureScreenshotPage requires an explicit url — never auto-discovered");
  }

  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const browserPage = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await browserPage.goto(url, { waitUntil: "networkidle" });

    const outPath = path.join(outDir, `page-${page}.png`);
    const gridEl = gridSelector ? await browserPage.$(gridSelector) : null;

    if (gridEl) {
      await gridEl.screenshot({ path: outPath });
    } else {
      await browserPage.screenshot({ path: outPath, fullPage: true });
    }

    return { page, outPath };
  } finally {
    await browser.close();
  }
}
