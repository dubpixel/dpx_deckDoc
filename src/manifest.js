// ================================================================================
// MANIFEST - shared read/append for output/manifest.json
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/manifest.js
// Purpose: Small shared helper for appending capture results to a device's
//          manifest.json. Used by both the CLI's low-level `capture`
//          command and the one-shot `scrape` command.
// Dependencies: none
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";

export async function loadManifest(outDir) {
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export async function appendManifest(outDir, entries) {
  const manifest = await loadManifest(outDir);
  manifest.push(...entries);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export async function resetManifest(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "manifest.json"), "[]");
}
