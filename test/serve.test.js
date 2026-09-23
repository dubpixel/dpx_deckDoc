// ================================================================================
// TEST - src/serve.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// Integration test: starts a real server against a fixture devices root and
// hits its actual HTTP endpoints. This is the module with the most routing
// surface (multi-device resolution, image paths, build/export) and the
// least prior coverage, so it's worth exercising for real rather than only
// unit-testing the pieces it calls.
//
// ================================================================================

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serve } from "../src/serve.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let devicesRoot;
let server;
let baseUrl;

before(async () => {
  devicesRoot = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-serve-test-"));
  const deviceDir = path.join(devicesRoot, "test-device");
  const imgDir = path.join(deviceDir, "images", "1");
  await fs.mkdir(imgDir, { recursive: true });
  await fs.writeFile(path.join(imgDir, "0-0.png"), TINY_PNG);

  await fs.writeFile(
    path.join(deviceDir, "manifest.json"),
    JSON.stringify([{ page: 1, row: 0, col: 0, image: path.join(imgDir, "0-0.png") }])
  );
  await fs.writeFile(path.join(deviceDir, "pages.json"), JSON.stringify({ 1: "Test Page" }));
  await fs.writeFile(
    path.join(deviceDir, "device.json"),
    JSON.stringify({ host: "10.0.0.5", port: 8000, scrapedAt: "2026-09-22T00:00:00.000Z" })
  );

  server = await serve({ outDir: devicesRoot, port: 0 });
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(devicesRoot, { recursive: true, force: true });
});

describe("GET /api/devices", () => {
  test("lists the fixture device with correct counts and its host metadata", async () => {
    const res = await fetch(`${baseUrl}/api/devices`);
    assert.equal(res.status, 200);
    const devices = await res.json();
    assert.equal(devices.length, 1);
    assert.equal(devices[0].slug, "test-device");
    assert.equal(devices[0].pageCount, 1);
    assert.equal(devices[0].buttonCount, 1);
    assert.equal(devices[0].host, "10.0.0.5", "device.json's host must surface in the device list");
    assert.equal(devices[0].port, 8000);
  });
});

describe("DELETE /api/devices/:slug", () => {
  test("removes a device's directory entirely", async () => {
    const throwawayDir = path.join(devicesRoot, "throwaway-device");
    await fs.mkdir(throwawayDir, { recursive: true });
    await fs.writeFile(path.join(throwawayDir, "manifest.json"), "[]");

    let listRes = await fetch(`${baseUrl}/api/devices`);
    assert.equal((await listRes.json()).length, 2, "throwaway device should be visible before delete");

    const delRes = await fetch(`${baseUrl}/api/devices/throwaway-device`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const body = await delRes.json();
    assert.equal(body.deleted, "throwaway-device");

    listRes = await fetch(`${baseUrl}/api/devices`);
    const remaining = await listRes.json();
    assert.equal(remaining.length, 1, "throwaway device must be gone after delete");
    assert.equal(remaining[0].slug, "test-device", "unrelated device must survive");

    await assert.rejects(fs.access(throwawayDir), "directory itself must be removed from disk");
  });

  test("404s deleting an unknown device", async () => {
    const res = await fetch(`${baseUrl}/api/devices/nonexistent`, { method: "DELETE" });
    assert.equal(res.status, 404);
  });
});

describe("GET /api/data", () => {
  test("404s for an unknown device", async () => {
    const res = await fetch(`${baseUrl}/api/data?device=nonexistent`);
    assert.equal(res.status, 404);
  });

  test("returns manifest/annotations/pageTitles/pageSelection for a known device", async () => {
    const res = await fetch(`${baseUrl}/api/data?device=test-device`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.manifest.length, 1);
    assert.deepEqual(data.pageTitles, { "1": "Test Page" });
    assert.deepEqual(data.annotations, {});
  });
});

describe("GET /images/:device/:page/:row-col.png", () => {
  test("serves a captured image", async () => {
    const res = await fetch(`${baseUrl}/images/test-device/1/0-0.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
  });

  test("404s for an unknown device in the image path", async () => {
    const res = await fetch(`${baseUrl}/images/nonexistent/1/0-0.png`);
    assert.equal(res.status, 404);
  });
});

describe("POST /api/annotation", () => {
  test("saves an edit and it's reflected in a subsequent /api/data fetch", async () => {
    const res = await fetch(`${baseUrl}/api/annotation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: "test-device", page: 1, row: 0, col: 0, heading: "Saved via HTTP" }),
    });
    assert.equal(res.status, 200);
    const saved = await res.json();
    assert.equal(saved.heading, "Saved via HTTP");

    const dataRes = await fetch(`${baseUrl}/api/data?device=test-device`);
    const data = await dataRes.json();
    assert.equal(data.annotations["1/0/0"].heading, "Saved via HTTP");
  });

  test("rejects a payload missing page/row/col", async () => {
    const res = await fetch(`${baseUrl}/api/annotation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: "test-device", heading: "no location" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("POST /api/page-selection", () => {
  test("persists an exclude and /api/data reflects it", async () => {
    const res = await fetch(`${baseUrl}/api/page-selection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: "test-device", changes: { 1: false } }),
    });
    assert.equal(res.status, 200);

    const dataRes = await fetch(`${baseUrl}/api/data?device=test-device`);
    const data = await dataRes.json();
    assert.equal(data.pageSelection["1"], false);
  });
});

describe("POST /api/build + GET /built/:device/...", () => {
  test("builds the site and serves it back", async () => {
    const res = await fetch(`${baseUrl}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: "test-device" }),
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.url, "/built/test-device/index.html");

    const builtRes = await fetch(`${baseUrl}${result.url}`);
    assert.equal(builtRes.status, 200);
    const html = await builtRes.text();
    assert.match(html, /dpx_deckDoc/);
  });

  test("404s for an unbuilt device instead of leaking a directory listing", async () => {
    const res = await fetch(`${baseUrl}/built/nonexistent/index.html`);
    assert.equal(res.status, 404);
  });
});
