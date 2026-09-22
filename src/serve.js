// ================================================================================
// LOCAL EDIT SERVER - live editable viewer
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/serve.js
// Purpose: Serves the captured images + annotations as a live, editable
//          local web app instead of a frozen static site. Annotation edits
//          POST back here and persist straight to output/annotations.json.
//          Plain Node `http`, no framework, no bundler.
// Dependencies: none
//
// ================================================================================

import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAnnotations, saveAnnotations, applyManualEdit, keyFor } from "./annotate/store.js";
import { getMeta } from "./meta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.join(__dirname, "..", "editor-template");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

async function loadManifest(outDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function loadPageTitles(outDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, "pages.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
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
 * @param {string} opts.outDir
 * @param {number} [opts.port]
 */
export async function serve({ outDir, port = 4321 }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === "/api/meta" && req.method === "GET") {
      return send(res, 200, JSON.stringify(getMeta()), MIME[".json"]);
    }

    if (url.pathname === "/api/data" && req.method === "GET") {
      const [manifest, annotations, pageTitles] = await Promise.all([
        loadManifest(outDir),
        loadAnnotations(outDir),
        loadPageTitles(outDir),
      ]);
      return send(res, 200, JSON.stringify({ manifest, annotations, pageTitles }), MIME[".json"]);
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
      const annotations = await loadAnnotations(outDir);
      const updated = applyManualEdit(annotations, edit);
      await saveAnnotations(outDir, annotations);
      return send(res, 200, JSON.stringify({ key: keyFor(edit.page, edit.row, edit.col), ...updated }), MIME[".json"]);
    }

    if (url.pathname.startsWith("/images/")) {
      const imgPath = path.join(outDir, url.pathname.replace(/^\/images\//, "images/"));
      if (!imgPath.startsWith(path.join(outDir, "images"))) return send(res, 403, "Forbidden", "text/plain");
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
