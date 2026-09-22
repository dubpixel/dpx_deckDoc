// ================================================================================
// TEST - src/site/build.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// Integration test: builds a real static site from a small fixture device
// dir and checks the output. Covers two regressions that already happened
// once: (1) the static site's script tag must NOT be type="module" — that
// silently fails under file:// due to CORS, and (2) `build` must honor
// page-selection.json and skip excluded pages entirely.
//
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSite } from "../src/site/build.js";

// Smallest valid PNG (1x1 transparent pixel) — build.js only copies the
// file, it never decodes it, so any valid-looking bytes are fine.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function makeFixtureDevice({ pageSelection } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-build-test-"));
  const imagesDir = path.join(dir, "images", "1");
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.writeFile(path.join(imagesDir, "0-0.png"), TINY_PNG);
  await fs.writeFile(path.join(imagesDir, "0-1.png"), TINY_PNG);

  const imagesDir2 = path.join(dir, "images", "2");
  await fs.mkdir(imagesDir2, { recursive: true });
  await fs.writeFile(path.join(imagesDir2, "0-0.png"), TINY_PNG);

  const manifest = [
    { page: 1, row: 0, col: 0, image: path.join(imagesDir, "0-0.png") },
    { page: 1, row: 0, col: 1, image: path.join(imagesDir, "0-1.png") },
    { page: 2, row: 0, col: 0, image: path.join(imagesDir2, "0-0.png") },
  ];
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));

  const annotations = {
    "1/0/0": {
      heading: "Test Heading",
      body: "Test body text",
      notice: "Test notice",
      note: "Test note",
      command: "Connection: test — Actions: cue",
      labelOverride: "OVERRIDE",
      source: "manual",
    },
  };
  await fs.writeFile(path.join(dir, "annotations.json"), JSON.stringify(annotations));

  await fs.writeFile(path.join(dir, "pages.json"), JSON.stringify({ 1: "Page One", 2: "Page Two" }));

  if (pageSelection) {
    await fs.writeFile(path.join(dir, "page-selection.json"), JSON.stringify(pageSelection));
  }

  return dir;
}

describe("buildSite", () => {
  test("builds an index.html and one page-N.html per included page", async () => {
    const dir = await makeFixtureDevice();
    try {
      const result = await buildSite({ outDir: dir });
      assert.equal(result.pageCount, 2);
      assert.equal(result.buttonCount, 3);

      const files = await fs.readdir(path.join(dir, "site"));
      assert.ok(files.includes("index.html"));
      assert.ok(files.includes("page-1.html"));
      assert.ok(files.includes("page-2.html"));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("viewer.js is loaded as a plain script, never type=\"module\" (fails under file://)", async () => {
    const dir = await makeFixtureDevice();
    try {
      await buildSite({ outDir: dir });
      const index = await fs.readFile(path.join(dir, "site", "index.html"), "utf8");
      assert.match(index, /<script src="viewer\.js"><\/script>/);
      assert.doesNotMatch(index, /type="module"/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("respects page-selection.json — excluded pages are skipped entirely", async () => {
    const dir = await makeFixtureDevice({ pageSelection: { 2: false } });
    try {
      const result = await buildSite({ outDir: dir });
      assert.equal(result.pageCount, 1);

      const files = await fs.readdir(path.join(dir, "site"));
      assert.ok(files.includes("page-1.html"));
      assert.ok(!files.includes("page-2.html"), "excluded page must not be emitted");

      const index = await fs.readFile(path.join(dir, "site", "index.html"), "utf8");
      assert.doesNotMatch(index, /Page Two/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("carries annotation fields (including labelOverride) into the page HTML", async () => {
    const dir = await makeFixtureDevice();
    try {
      await buildSite({ outDir: dir });
      const page1 = await fs.readFile(path.join(dir, "site", "page-1.html"), "utf8");
      assert.match(page1, /data-heading="Test Heading"/);
      assert.match(page1, /data-notice="Test notice"/);
      assert.match(page1, /class="label-override">OVERRIDE</);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("preserves the full physical grid — a button with no annotation still gets a cell", async () => {
    const dir = await makeFixtureDevice();
    try {
      await buildSite({ outDir: dir });
      const page1 = await fs.readFile(path.join(dir, "site", "page-1.html"), "utf8");
      assert.match(page1, /data-loc="0\/1"/, "the un-annotated button (0/1) must still render");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
