// ================================================================================
// TEST - src/manifest.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadManifest, appendManifest, resetManifest } from "../src/manifest.js";

describe("manifest", () => {
  test("loadManifest returns an empty array when no file exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
    try {
      assert.deepEqual(await loadManifest(dir), []);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("appendManifest accumulates entries across calls", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
    try {
      await appendManifest(dir, [{ page: 1, row: 0, col: 0, image: "a.png" }]);
      await appendManifest(dir, [{ page: 1, row: 0, col: 1, image: "b.png" }]);
      const manifest = await loadManifest(dir);
      assert.equal(manifest.length, 2);
      assert.equal(manifest[1].col, 1);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("resetManifest clears prior entries (used before a fresh scrape)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
    try {
      await appendManifest(dir, [{ page: 1, row: 0, col: 0, image: "a.png" }]);
      await resetManifest(dir);
      assert.deepEqual(await loadManifest(dir), []);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
