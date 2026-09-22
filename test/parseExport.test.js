// ================================================================================
// TEST - src/config/parseExport.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// The fixture below is shaped exactly like a real Companion 4.3.4 export
// (confirmed 2026-09-22 against a live instance — see parseExport.js's own
// header comment). This schema was wrong twice during development (flat
// "row/col" keys, "action"/"actionId" instead of "definitionId") before
// being fixed against real data — these tests exist so a future refactor
// can't silently reintroduce either mistake.
//
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { parseCompanionExport, parsePageTitles } from "../src/config/parseExport.js";

const FIXTURE_EXPORT = {
  version: 12,
  type: "full",
  companionBuild: "4.3.4+test-fixture",
  pages: {
    1: {
      id: "page1id",
      name: "quick",
      gridSize: { minColumn: 0, maxColumn: 1, minRow: 0, maxRow: 0 },
      controls: {
        0: {
          0: { type: "pageup" },
          1: {
            type: "button",
            style: { text: "grids" },
            steps: {
              0: {
                action_sets: {
                  down: [
                    { type: "action", id: "act1", definitionId: "cue", connectionId: "connA", options: {} },
                    { type: "action", id: "act2", definitionId: "cue", connectionId: "connB", options: {} },
                  ],
                  up: [],
                },
                options: {},
              },
            },
            feedbacks: [],
          },
        },
      },
    },
    2: {
      id: "page2id",
      name: "empty page",
      gridSize: { minColumn: 0, maxColumn: 0, minRow: 0, maxRow: 0 },
      controls: {
        0: {
          0: {
            type: "button",
            style: { text: "" },
            steps: { 0: { action_sets: { down: [], up: [] }, options: {} } },
            feedbacks: [],
          },
        },
      },
    },
  },
  instances: {
    connA: { moduleInstanceType: "connection", moduleId: "test-module-a", label: "101-stage2-LW" },
    connB: { moduleInstanceType: "connection", moduleId: "test-module-b", label: "d3osc-main" },
  },
};

async function writeFixture(gzip) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-test-"));
  const filePath = path.join(dir, "export.companionconfig");
  const json = JSON.stringify(FIXTURE_EXPORT);
  const buf = gzip ? zlib.gzipSync(json) : Buffer.from(json);
  await fs.writeFile(filePath, buf);
  return { dir, filePath };
}

describe("parseCompanionExport", () => {
  test("parses a gzip-compressed export (the real format)", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const results = await parseCompanionExport(filePath);
      assert.ok(results.length > 0, "gzip fixture must parse to at least one button");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("also parses plain (uncompressed) JSON as a fallback", async () => {
    const { dir, filePath } = await writeFixture(false);
    try {
      const results = await parseCompanionExport(filePath);
      assert.ok(results.length > 0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("reads controls nested as controls[row][col], not a flat 'row/col' key", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const results = await parseCompanionExport(filePath);
      const button = results.find((r) => r.page === 1 && r.row === 0 && r.col === 1);
      assert.ok(button, "the button at page 1, row 0, col 1 must be found via nested controls");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("uses definitionId for the action name, not action/actionId", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const results = await parseCompanionExport(filePath);
      const button = results.find((r) => r.page === 1 && r.row === 0 && r.col === 1);
      assert.deepEqual(button.actionSummaries, ["cue", "cue"]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("resolves connectionId to the instance's label, not the raw id", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const results = await parseCompanionExport(filePath);
      const button = results.find((r) => r.page === 1 && r.row === 0 && r.col === 1);
      assert.deepEqual(button.connections, ["101-stage2-LW", "d3osc-main"]);
      assert.ok(button.command.includes("101-stage2-LW"));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("native page-nav controls (pageup/pagedown/pagenum) get an honest command, not silence", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const results = await parseCompanionExport(filePath);
      const nav = results.find((r) => r.page === 1 && r.row === 0 && r.col === 0);
      assert.equal(nav.controlType, "pageup");
      assert.match(nav.command, /page-up/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("a button with no actions gets an honest 'no actions configured' command, not a fabricated one", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const results = await parseCompanionExport(filePath);
      const empty = results.find((r) => r.page === 2 && r.row === 0 && r.col === 0);
      assert.equal(empty.command, "(no actions configured)");
      assert.deepEqual(empty.connections, []);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("parsePageTitles", () => {
  test("returns Companion's own page names keyed by page number", async () => {
    const { dir, filePath } = await writeFixture(true);
    try {
      const titles = await parsePageTitles(filePath);
      assert.deepEqual(titles, { 1: "quick", 2: "empty page" });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
