// ================================================================================
// TEST - src/scrape.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: test/scrape.test.js
// Purpose: Regression coverage for scrapeDevice()'s error handling —
//          specifically the friendly-message wrapping added while reviewing
//          issue #9 (`init`/`scrape` used to surface Node's bare "fetch
//          failed" for a connection-level failure like a wrong/unreachable
//          --host, instead of a one-line actionable message). Mocks
//          global.fetch so no real network call is made.
// Dependencies: node:test, node:assert
//
// ================================================================================

import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { scrapeDevice } from "../src/scrape.js";

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "dpx-scrape-test-"));
}

describe("scrapeDevice error handling", () => {
  test("requires an explicit host (never auto-discovered)", async () => {
    await assert.rejects(
      () => scrapeDevice({ host: "" }),
      /requires an explicit host/
    );
  });

  test("a connection-level fetch failure (e.g. wrong/unreachable host) surfaces a friendly one-line message, not the raw 'fetch failed' error", async (t) => {
    const devicesRoot = await tmpDir();
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:19999"), { code: "ECONNREFUSED" });
    t.mock.method(global, "fetch", async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause });
    });

    await assert.rejects(
      () => scrapeDevice({ host: "127.0.0.1", port: 19999, devicesRoot, onProgress: () => {} }),
      (err) => {
        assert.match(err.message, /Could not reach Companion at http:\/\/127\.0\.0\.1:19999/);
        assert.match(err.message, /ECONNREFUSED/);
        assert.doesNotMatch(err.message, /^fetch failed$/);
        return true;
      }
    );
  });

  test("a non-ok HTTP response still gets the existing friendly status message", async (t) => {
    const devicesRoot = await tmpDir();
    t.mock.method(global, "fetch", async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }));

    await assert.rejects(
      () => scrapeDevice({ host: "10.0.0.5", devicesRoot, onProgress: () => {} }),
      /Config export request failed: 404 Not Found/
    );
  });
});
