// ================================================================================
// TEST - src/pageSelection.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadPageSelection, savePageSelection, isIncluded } from "../src/pageSelection.js";

describe("isIncluded", () => {
  test("a page with no entry is included by default", () => {
    assert.equal(isIncluded({}, 5), true);
  });

  test("a page explicitly set to false is excluded", () => {
    assert.equal(isIncluded({ "5": false }, 5), false);
  });

  test("a page explicitly set to true is included", () => {
    assert.equal(isIncluded({ "5": true }, 5), true);
  });

  test("accepts a numeric page argument against string-keyed selection", () => {
    assert.equal(isIncluded({ "12": false }, 12), false);
  });
});

describe("loadPageSelection / savePageSelection", () => {
  test("missing file loads as empty object (everything included)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
    try {
      assert.deepEqual(await loadPageSelection(dir), {});
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("round-trips through disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
    try {
      await savePageSelection(dir, { "1": true, "2": false });
      const reloaded = await loadPageSelection(dir);
      assert.equal(reloaded["1"], true);
      assert.equal(reloaded["2"], false);
      assert.equal(isIncluded(reloaded, 2), false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
