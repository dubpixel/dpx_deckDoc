// ================================================================================
// TEST - src/demoDevice.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buttonSvg, demoFixture, seedDemoDevice } from "../src/demoDevice.js";

describe("demoFixture", () => {
  test("describes a fixed, small set of pages with no network-shaped fields", () => {
    const fixture = demoFixture();
    assert.equal(fixture.pages.length, 2);
    assert.equal(fixture.rows, 4);
    assert.equal(fixture.cols, 8);
    // Sanity check: nothing here looks like a real host/IP to accidentally dial.
    assert.equal(JSON.stringify(fixture).includes("http://"), false);
  });

  test("every annotation key matches page/row/col within the fixture's grid", () => {
    const { pages, annotations, rows, cols } = demoFixture();
    const pageNumbers = new Set(pages.map((p) => p.page));
    for (const key of Object.keys(annotations)) {
      const [page, row, col] = key.split("/").map(Number);
      assert.ok(pageNumbers.has(page), `annotation ${key} references an unknown page`);
      assert.ok(row >= 0 && row < rows, `annotation ${key} row out of range`);
      assert.ok(col >= 0 && col < cols, `annotation ${key} col out of range`);
    }
  });
});

describe("buttonSvg", () => {
  test("renders a valid-looking <svg> with the label text embedded", () => {
    const svg = buttonSvg({ row: 0, col: 0, color: "#2f7a3d", label: "GO\nLIVE" });
    assert.match(svg, /^<svg /);
    assert.match(svg, /GO/);
    assert.match(svg, /LIVE/);
    assert.match(svg, /#2f7a3d/);
  });

  test("escapes XML special characters in a label", () => {
    const svg = buttonSvg({ row: 0, col: 0, label: "<tag> & \"quote\"" });
    assert.equal(svg.includes("<tag>"), false);
    assert.match(svg, /&lt;tag&gt;/);
    assert.match(svg, /&amp;/);
  });

  test("falls back to row/col text when no label is given (blank slot)", () => {
    const svg = buttonSvg({ row: 2, col: 3 });
    assert.match(svg, />2\/3</);
  });
});

describe("seedDemoDevice", () => {
  test("writes a device directory shaped identically to a real scrapeDevice() output", async () => {
    const devicesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-demo-test-"));
    try {
      const result = await seedDemoDevice({ devicesRoot, deviceSlug: "demo" });
      assert.equal(result.device, "demo");
      assert.equal(result.pageCount, 2);
      assert.ok(result.buttonCount > 0);

      const outDir = path.join(devicesRoot, "demo");
      const manifest = JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
      assert.equal(manifest.length, result.buttonCount);

      const pages = JSON.parse(await fs.readFile(path.join(outDir, "pages.json"), "utf8"));
      assert.equal(Object.keys(pages).length, 2);

      const annotations = JSON.parse(await fs.readFile(path.join(outDir, "annotations.json"), "utf8"));
      assert.ok(Object.keys(annotations).length > 0);

      const device = JSON.parse(await fs.readFile(path.join(outDir, "device.json"), "utf8"));
      assert.ok(device.scrapedAt);
      // Clearly labeled as fake so nobody mistakes it for a real capture.
      assert.match(device.host, /demo/i);

      // Every manifest entry's image file actually exists on disk.
      for (const entry of manifest) {
        await assert.doesNotReject(fs.access(entry.image));
      }
    } finally {
      await fs.rm(devicesRoot, { recursive: true, force: true });
    }
  });

  test("defaults to a devices/demo slug when no deviceSlug is given", async () => {
    const devicesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-demo-test-"));
    try {
      const result = await seedDemoDevice({ devicesRoot });
      assert.equal(result.device, "demo");
      assert.equal(result.outDir, path.join(devicesRoot, "demo"));
    } finally {
      await fs.rm(devicesRoot, { recursive: true, force: true });
    }
  });

  test("re-seeding overwrites cleanly (no duplicate manifest entries)", async () => {
    const devicesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-demo-test-"));
    try {
      await seedDemoDevice({ devicesRoot, deviceSlug: "demo" });
      const second = await seedDemoDevice({ devicesRoot, deviceSlug: "demo" });
      const manifest = JSON.parse(
        await fs.readFile(path.join(devicesRoot, "demo", "manifest.json"), "utf8")
      );
      assert.equal(manifest.length, second.buttonCount);
    } finally {
      await fs.rm(devicesRoot, { recursive: true, force: true });
    }
  });
});
