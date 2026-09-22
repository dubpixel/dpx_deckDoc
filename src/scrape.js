// ================================================================================
// SCRAPE - one-shot "capture the whole instance" command
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/scrape.js
// Purpose: Points at a single Companion instance (`--host`) and does the
//          entire capture+annotate pipeline in one shot: pulls the config
//          export, discovers every real page from it, captures every
//          button image from the web UI, and merges annotation prefill —
//          instead of the caller having to loop `capture`/`annotate`
//          per-page by hand. Output is namespaced per device, so multiple
//          Companion instances live side by side as devices/<slug>/.
// Dependencies: none beyond what capture/config/annotate already need
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { captureManyPages } from "./capture/screenshot.js";
import { parseCompanionExport, parsePageTitles } from "./config/parseExport.js";
import { loadAnnotations, saveAnnotations, mergePrefill } from "./annotate/store.js";
import { appendManifest, resetManifest } from "./manifest.js";

function slugify(host) {
  return host.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * @param {object} opts
 * @param {string} opts.host - Companion instance IP/hostname. Required, never guessed.
 * @param {number} [opts.port] - web UI port, default 8000
 * @param {string} [opts.device] - device slug; defaults to a sanitized version of `host`
 * @param {string} [opts.devicesRoot] - root dir devices live under, default "devices"
 * @param {(msg: string) => void} [opts.onProgress] - optional progress callback (page-by-page)
 */
export async function scrapeDevice({ host, port = 8000, device, devicesRoot = "devices", onProgress = console.log }) {
  if (!host) throw new Error("scrapeDevice requires an explicit host — never auto-discovered");

  const deviceSlug = device ?? slugify(host);
  const outDir = path.join(devicesRoot, deviceSlug);
  await fs.mkdir(outDir, { recursive: true });

  const base = `http://${host}:${port}`;
  onProgress(`Fetching config export from ${base}/int/export/full ...`);
  const res = await fetch(`${base}/int/export/full`);
  if (!res.ok) {
    throw new Error(`Config export request failed: ${res.status} ${res.statusText} (is Companion running at ${base}?)`);
  }
  const exportPath = path.join(outDir, "export.companionconfig");
  await fs.writeFile(exportPath, Buffer.from(await res.arrayBuffer()));

  const pageTitles = await parsePageTitles(exportPath);
  const pageNumbers = Object.keys(pageTitles).map(Number).sort((a, b) => a - b);
  if (!pageNumbers.length) throw new Error("Config export had no pages — nothing to capture");

  onProgress(`Found ${pageNumbers.length} pages. Capturing each from the web UI (one browser session for the whole scrape)...`);
  await resetManifest(outDir);

  const pageSpecs = pageNumbers.map((page) => ({
    page,
    url: `${base}/tablet.html?page=${page}`,
    outDir: path.join(outDir, "images", String(page)),
  }));

  const results = await captureManyPages({
    pages: pageSpecs,
    onProgress: (msg) => onProgress(msg),
  });

  let totalButtons = 0;
  for (const result of results) {
    const entries = result.buttons.map((b) => ({ page: result.page, row: b.row, col: b.col, image: b.path }));
    await appendManifest(outDir, entries);
    totalButtons += entries.length;
  }

  const buttonMetas = await parseCompanionExport(exportPath);
  const annotations = await loadAnnotations(outDir);
  mergePrefill(annotations, buttonMetas);
  await saveAnnotations(outDir, annotations);
  await fs.writeFile(path.join(outDir, "pages.json"), JSON.stringify(pageTitles, null, 2));

  onProgress(`Done: device "${deviceSlug}" — ${pageNumbers.length} pages, ${totalButtons} buttons -> ${outDir}`);
  return { device: deviceSlug, outDir, pageCount: pageNumbers.length, buttonCount: totalButtons };
}
