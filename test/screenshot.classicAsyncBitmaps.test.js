// ================================================================================
// TEST - src/capture/screenshot.js's classic-UI async-bitmap wait, end-to-end
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// Every other capture test in this file/project stays unit-level (browser/DOM
// capture itself is documented as untested — see AGENTS.md). This one is a
// deliberate exception: the bug it covers (reading the classic UI's button
// grid before its WebSocket-delivered bitmaps finish arriving, silently
// capturing near-duplicate placeholder frames for 98% of buttons) was found
// on a real Companion 3.0.0 instance that's no longer reachable to verify
// against live. A synthetic fixture that reproduces the same async-src-swap
// behavior, driven by a real Playwright browser against a real local HTTP
// server, is the closest available substitute for re-scraping the real rig.
//
// ================================================================================

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureManyPages } from "../src/capture/screenshot.js";

const COLS = 4;
const ROWS = 2;
const PER_PAGE = COLS * ROWS;
const PAGES = [1, 2];

// A fake "classic" Companion tablet page: every .bank img starts out showing
// the SAME placeholder bitmap (mirrors what the real instance does before its
// WebSocket delivers real per-button content), then swaps to a distinct
// bitmap per button after a delay — long enough that a naive "read
// immediately after networkidle" capture would still see mostly placeholders.
function fakeClassicHtml() {
  let banks = "";
  for (const page of PAGES) {
    for (let n = 1; n <= PER_PAGE; n++) {
      banks += `<div class="bank clickable"><div class="bank-border"><img alt="Button ${n}" data-page="${page}" data-n="${n}" src="data:image/bmp;base64,${btoa("placeholder")}"></div></div>`;
    }
  }
  return `<!doctype html><html><body>
<div class="button-zone"><div class="row"><div class="pagebank-row">${banks}</div></div></div>
<script>
  setTimeout(() => {
    document.querySelectorAll(".bank img").forEach((img) => {
      const marker = "real-" + img.dataset.page + "-" + img.dataset.n;
      img.src = "data:image/bmp;base64," + btoa(marker);
    });
  }, 1200);
</script>
</body></html>`;
}

let server;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(fakeClassicHtml());
  });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("captureManyPages against a classic UI with async-loaded bitmaps", () => {
  test("waits for bitmaps to settle instead of capturing the shared placeholder frame", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-async-classic-test-"));
    const pages = PAGES.map((page) => ({
      page,
      url: `${baseUrl}/tablet.html?page=${page}`,
      outDir: path.join(tmpRoot, String(page)),
    }));

    const results = await captureManyPages({ pages });

    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.buttons.length, PER_PAGE, `page ${result.page} should have ${PER_PAGE} buttons`);
    }

    // The real assertion: every written image must decode to its OWN unique
    // "real-<page>-<n>" marker, not the shared "placeholder" one. If the
    // settle-wait regressed, this fails exactly the way the real scrape did.
    for (const result of results) {
      for (const btn of result.buttons) {
        const bytes = await fs.readFile(btn.path, "utf8");
        assert.notEqual(bytes, "placeholder", `page ${result.page} row/col ${btn.row}/${btn.col} still shows the placeholder frame`);
        assert.match(bytes, /^real-\d+-\d+$/, `page ${result.page} row/col ${btn.row}/${btn.col} has unexpected content: ${bytes}`);
      }
    }

    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
