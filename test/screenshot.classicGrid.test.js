// ================================================================================
// TEST - src/capture/screenshot.js's classic-UI pure logic
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// Covers extForDataUrl() and chunkClassicGrid() — the pure, non-browser-
// coupled pieces of the classic (pre-4.x) Companion capture path. Capture's
// browser-driving code itself stays untested (DOM/Playwright-coupled, see
// AGENTS.md); this is the logic that was actually wrong when a real 3.0.0
// instance silently captured zero buttons on every page.
//
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extForDataUrl, chunkClassicGrid } from "../src/capture/screenshot.js";

describe("extForDataUrl", () => {
  test("derives the real extension from the data URL's mime type", () => {
    assert.equal(extForDataUrl("data:image/bmp;base64,Qk32"), ".bmp");
    assert.equal(extForDataUrl("data:image/png;base64,iVBOR"), ".png");
  });

  test("falls back to .png for an unrecognized data URL", () => {
    assert.equal(extForDataUrl("not-a-data-url"), ".png");
  });
});

describe("chunkClassicGrid", () => {
  // Matches the real shape confirmed against a live Companion 3.0.0 instance
  // (2026-09-23): alt="Button N" resets to 1 at each page boundary, 8 columns
  // sharing the same bounding-box top per row.
  function fakeButton(n, rowIndex) {
    return { alt: `Button ${n}`, src: `data:image/bmp;base64,btn${n}`, top: 60 + rowIndex * 146 };
  }

  test("splits a flat DOM-order list into pages using the alt='Button N' reset as the boundary", () => {
    const raw = [];
    for (let page = 0; page < 3; page++) {
      for (let n = 1; n <= 32; n++) {
        raw.push(fakeButton(n, Math.floor((n - 1) / 8)));
      }
    }
    const chunks = chunkClassicGrid(raw);
    assert.equal(chunks.length, 3);
    for (const chunk of chunks) assert.equal(chunk.length, 32);
  });

  test("derives row/col from measured column count, not a hardcoded grid size", () => {
    const raw = [];
    for (let n = 1; n <= 32; n++) raw.push(fakeButton(n, Math.floor((n - 1) / 8)));
    const [page] = chunkClassicGrid(raw);
    assert.deepEqual(page[0], { row: 0, col: 0, dataUrl: "data:image/bmp;base64,btn1" });
    assert.deepEqual(page[7], { row: 0, col: 7, dataUrl: "data:image/bmp;base64,btn8" });
    assert.deepEqual(page[8], { row: 1, col: 0, dataUrl: "data:image/bmp;base64,btn9" });
    assert.deepEqual(page[31], { row: 3, col: 7, dataUrl: "data:image/bmp;base64,btn32" });
  });

  test("handles a grid whose column count differs from the classic 8-wide default", () => {
    // a 5-wide, 2-row page (10 buttons) — everything in row 0 shares one top offset
    const raw = [1, 2, 3, 4, 5].map((n) => ({ alt: `Button ${n}`, src: `d${n}`, top: 60 }))
      .concat([6, 7, 8, 9, 10].map((n) => ({ alt: `Button ${n}`, src: `d${n}`, top: 200 })));
    const [page] = chunkClassicGrid(raw);
    assert.equal(page.length, 10);
    assert.deepEqual(page[4], { row: 0, col: 4, dataUrl: "d5" });
    assert.deepEqual(page[5], { row: 1, col: 0, dataUrl: "d6" });
  });

  test("returns an empty array for no input", () => {
    assert.deepEqual(chunkClassicGrid([]), []);
  });
});
