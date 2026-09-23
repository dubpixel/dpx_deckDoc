// ================================================================================
// LOCAL EDIT SERVER - live editable viewer, multi-device
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/serve.js
// Purpose: Serves captured images + annotations as a live, editable local
//          web app instead of a frozen static site. Annotation edits POST
//          back here and persist straight to <device>/annotations.json.
//          Plain Node `http`, no framework, no bundler.
//
//          Multi-device: `outDir` (the CLI's `--out`, default "devices") is
//          treated as a devices ROOT — each immediate subdirectory that
//          contains a manifest.json is one device (one Companion instance,
//          as written by `scrape`). If `outDir` itself directly contains a
//          manifest.json (the old single-target `capture`/`annotate`
//          workflow), it's treated as one implicit device named after its
//          own directory — so existing single-device output still works
//          unchanged.
// Dependencies: none
//
// ================================================================================

import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAnnotations, saveAnnotations, applyManualEdit, keyFor } from "./annotate/store.js";
import { loadPageSelection, savePageSelection } from "./pageSelection.js";
import { getMeta } from "./meta.js";
import { scrapeDevice } from "./scrape.js";
import { buildSite } from "./site/build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.join(__dirname, "..", "editor-template");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

async function loadManifest(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function loadPageTitles(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "pages.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function loadDeviceMeta(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "device.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Resolves the set of devices under a root: { slug -> absolute dir path }.
 */
async function resolveDevices(root) {
  const devices = {};
  if (fsSync.existsSync(path.join(root, "manifest.json"))) {
    devices[path.basename(path.resolve(root))] = root;
    return devices;
  }
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return devices;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (fsSync.existsSync(path.join(candidate, "manifest.json"))) {
      devices[entry.name] = candidate;
    }
  }
  return devices;
}

function send(res, status, body, contentType) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function serveStatic(res, dir, reqPath) {
  const filePath = path.join(dir, reqPath === "/" ? "editor.html" : reqPath);
  if (!filePath.startsWith(dir)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const data = await fs.readFile(filePath);
    send(res, 200, data, MIME[path.extname(filePath)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

/**
 * @param {object} opts
 * @param {string} opts.outDir - devices root (or a single device dir, see file header)
 * @param {number} [opts.port]
 */
export async function serve({ outDir, port = 4321 }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === "/api/meta" && req.method === "GET") {
      return send(res, 200, JSON.stringify(getMeta()), MIME[".json"]);
    }

    if (url.pathname === "/api/devices" && req.method === "GET") {
      const devices = await resolveDevices(outDir);
      const summaries = await Promise.all(
        Object.entries(devices).map(async ([slug, dir]) => {
          const [manifest, deviceMeta] = await Promise.all([loadManifest(dir), loadDeviceMeta(dir)]);
          const pageCount = new Set(manifest.map((e) => e.page)).size;
          return { slug, pageCount, buttonCount: manifest.length, ...deviceMeta };
        })
      );
      return send(res, 200, JSON.stringify(summaries), MIME[".json"]);
    }

    if (url.pathname.startsWith("/api/devices/") && req.method === "DELETE") {
      const slug = decodeURIComponent(url.pathname.slice("/api/devices/".length));
      const devices = await resolveDevices(outDir);
      const dir = devices[slug];
      if (!dir) return send(res, 404, JSON.stringify({ error: `unknown device "${slug}"` }), MIME[".json"]);
      await fs.rm(dir, { recursive: true, force: true });
      return send(res, 200, JSON.stringify({ deleted: slug }), MIME[".json"]);
    }

    if (url.pathname === "/api/data" && req.method === "GET") {
      const devices = await resolveDevices(outDir);
      const slug = url.searchParams.get("device");
      const dir = devices[slug];
      if (!dir) return send(res, 404, JSON.stringify({ error: `unknown device "${slug}"` }), MIME[".json"]);
      const [manifest, annotations, pageTitles, pageSelection] = await Promise.all([
        loadManifest(dir),
        loadAnnotations(dir),
        loadPageTitles(dir),
        loadPageSelection(dir),
      ]);
      return send(res, 200, JSON.stringify({ manifest, annotations, pageTitles, pageSelection }), MIME[".json"]);
    }

    if (url.pathname === "/api/page-selection" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, JSON.stringify({ error: "invalid JSON" }), MIME[".json"]);
      }
      const devices = await resolveDevices(outDir);
      const dir = devices[body.device];
      if (!dir) return send(res, 404, JSON.stringify({ error: `unknown device "${body.device}"` }), MIME[".json"]);
      const selection = await loadPageSelection(dir);
      // body.changes: { [page]: boolean }
      for (const [page, included] of Object.entries(body.changes ?? {})) {
        selection[page] = Boolean(included);
      }
      await savePageSelection(dir, selection);
      return send(res, 200, JSON.stringify(selection), MIME[".json"]);
    }

    if (url.pathname === "/api/scrape" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, JSON.stringify({ error: "invalid JSON" }), MIME[".json"]);
      }
      if (!body.host) return send(res, 400, JSON.stringify({ error: "host is required" }), MIME[".json"]);

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      try {
        const result = await scrapeDevice({
          host: body.host,
          port: body.port ? Number(body.port) : undefined,
          device: body.device || undefined,
          devicesRoot: outDir,
          onProgress: (msg) => res.write(msg + "\n"),
        });
        res.write(`__DONE__ ${JSON.stringify(result)}\n`);
      } catch (err) {
        res.write(`__ERROR__ ${err.message}\n`);
      }
      return res.end();
    }

    if (url.pathname === "/api/build" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, JSON.stringify({ error: "invalid JSON" }), MIME[".json"]);
      }
      const devices = await resolveDevices(outDir);
      const dir = devices[body.device];
      if (!dir) return send(res, 404, JSON.stringify({ error: `unknown device "${body.device}"` }), MIME[".json"]);
      try {
        const result = await buildSite({ outDir: dir });
        return send(res, 200, JSON.stringify({ ...result, url: `/built/${body.device}/index.html` }), MIME[".json"]);
      } catch (err) {
        return send(res, 500, JSON.stringify({ error: err.message }), MIME[".json"]);
      }
    }

    if (url.pathname.startsWith("/built/")) {
      const devices = await resolveDevices(outDir);
      const [, , slug, ...rest] = url.pathname.split("/"); // "", "built", "<device>", "index.html" | "page-1.html" | ...
      const dir = devices[slug];
      if (!dir) return send(res, 404, "Unknown device", "text/plain");
      const siteDir = path.join(dir, "site");
      const filePath = path.join(siteDir, rest.length ? rest.join("/") : "index.html");
      if (!filePath.startsWith(siteDir)) return send(res, 403, "Forbidden", "text/plain");
      try {
        const data = await fs.readFile(filePath);
        return send(res, 200, data, MIME[path.extname(filePath)] ?? "application/octet-stream");
      } catch {
        return send(res, 404, "Not built yet — click Export first", "text/plain");
      }
    }

    if (url.pathname === "/api/annotation" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let edit;
      try {
        edit = JSON.parse(raw);
      } catch {
        return send(res, 400, JSON.stringify({ error: "invalid JSON" }), MIME[".json"]);
      }
      if (typeof edit.page !== "number" || typeof edit.row !== "number" || typeof edit.col !== "number") {
        return send(res, 400, JSON.stringify({ error: "page/row/col are required numbers" }), MIME[".json"]);
      }
      const devices = await resolveDevices(outDir);
      const dir = devices[edit.device];
      if (!dir) return send(res, 404, JSON.stringify({ error: `unknown device "${edit.device}"` }), MIME[".json"]);
      const annotations = await loadAnnotations(dir);
      const updated = applyManualEdit(annotations, edit);
      await saveAnnotations(dir, annotations);
      return send(res, 200, JSON.stringify({ key: keyFor(edit.page, edit.row, edit.col), ...updated }), MIME[".json"]);
    }

    if (url.pathname.startsWith("/images/")) {
      const devices = await resolveDevices(outDir);
      const [, , slug, ...rest] = url.pathname.split("/"); // "", "images", "<device>", "<page>", "<row-col.png>"
      const dir = devices[slug];
      if (!dir) return send(res, 404, "Unknown device", "text/plain");
      const imgPath = path.join(dir, "images", ...rest);
      if (!imgPath.startsWith(path.join(dir, "images"))) return send(res, 403, "Forbidden", "text/plain");
      if (!fsSync.existsSync(imgPath)) return send(res, 404, "Not found", "text/plain");
      return send(res, 200, await fs.readFile(imgPath), "image/png");
    }

    return serveStatic(res, EDITOR_DIR, url.pathname);
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`dpx_deckDoc editor running at http://localhost:${port}`);
      resolve(server);
    });
  });
}
