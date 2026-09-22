// ================================================================================
// TEST - src/annotate/store.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// Regression coverage for the annotation store's two non-obvious
// invariants: prefill never overwrites a manual edit, and prefill never
// touches `body` (only `command`) — both were explicit user requirements
// that regressed once already during development.
//
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  keyFor,
  mergePrefill,
  applyManualEdit,
  loadAnnotations,
  saveAnnotations,
} from "../src/annotate/store.js";

describe("keyFor", () => {
  test("formats page/row/col as a stable string key", () => {
    assert.equal(keyFor(1, 0, 2), "1/0/2");
    assert.equal(keyFor(99, 3, 7), "99/3/7");
  });
});

describe("mergePrefill", () => {
  test("populates command, never body, for a fresh button", () => {
    const annotations = {};
    mergePrefill(annotations, [
      { page: 1, row: 0, col: 2, command: "Connection: foo — Actions: cue" },
    ]);
    const entry = annotations["1/0/2"];
    assert.equal(entry.command, "Connection: foo — Actions: cue");
    assert.equal(entry.body, "", "prefill must never write to body");
    assert.equal(entry.heading, "");
    assert.equal(entry.notice, "");
    assert.equal(entry.note, "");
    assert.equal(entry.labelOverride, "");
    assert.equal(entry.source, "prefilled");
  });

  test("never overwrites an existing manual entry", () => {
    const annotations = {
      "1/0/2": {
        heading: "Test Pattern",
        body: "Human-written explanation",
        notice: "",
        note: "",
        command: "old stale command text",
        labelOverride: "",
        source: "manual",
      },
    };
    mergePrefill(annotations, [
      { page: 1, row: 0, col: 2, command: "brand new prefill that should be ignored" },
    ]);
    const entry = annotations["1/0/2"];
    assert.equal(entry.body, "Human-written explanation");
    assert.equal(entry.command, "old stale command text");
    assert.equal(entry.source, "manual");
  });

  test("re-running prefill on a still-prefilled entry replaces it cleanly", () => {
    const annotations = {};
    mergePrefill(annotations, [{ page: 1, row: 0, col: 0, command: "first" }]);
    mergePrefill(annotations, [{ page: 1, row: 0, col: 0, command: "second" }]);
    assert.equal(annotations["1/0/0"].command, "second");
    assert.equal(annotations["1/0/0"].source, "prefilled");
  });
});

describe("applyManualEdit", () => {
  test("creates a new manual entry with defaults for unset fields", () => {
    const annotations = {};
    const result = applyManualEdit(annotations, { page: 2, row: 1, col: 3, heading: "Hello" });
    assert.equal(result.heading, "Hello");
    assert.equal(result.body, "");
    assert.equal(result.source, "manual");
    assert.equal(annotations["2/1/3"], result);
  });

  test("preserves fields not included in the edit", () => {
    const annotations = {
      "1/0/0": {
        heading: "Existing heading",
        body: "Existing body",
        notice: "",
        note: "",
        command: "",
        labelOverride: "",
        source: "manual",
      },
    };
    applyManualEdit(annotations, { page: 1, row: 0, col: 0, notice: "New notice" });
    assert.equal(annotations["1/0/0"].heading, "Existing heading", "unrelated field must survive a partial edit");
    assert.equal(annotations["1/0/0"].notice, "New notice");
  });

  test("always marks the entry manual, converting a prefilled entry", () => {
    const annotations = {};
    mergePrefill(annotations, [{ page: 1, row: 0, col: 0, command: "prefill data" }]);
    assert.equal(annotations["1/0/0"].source, "prefilled");
    applyManualEdit(annotations, { page: 1, row: 0, col: 0, body: "human writeup" });
    assert.equal(annotations["1/0/0"].source, "manual");
    assert.equal(annotations["1/0/0"].command, "prefill data", "manual edit preserves prior command text");
  });
});

describe("loadAnnotations / saveAnnotations", () => {
  test("round-trips through disk", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
    try {
      assert.deepEqual(await loadAnnotations(dir), {}, "missing file loads as empty object");
      const annotations = {};
      applyManualEdit(annotations, { page: 1, row: 0, col: 0, heading: "Saved" });
      await saveAnnotations(dir, annotations);
      const reloaded = await loadAnnotations(dir);
      assert.equal(reloaded["1/0/0"].heading, "Saved");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
