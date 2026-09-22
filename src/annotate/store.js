// ================================================================================
// ANNOTATION STORE - reads/writes output/annotations.json
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/annotate/store.js
// Purpose: Merges config-export-derived prefill annotations into the
//          annotation store without ever overwriting a hand-written entry.
// Dependencies: none
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";

function keyFor(page, row, col) {
  return `${page}/${row}/${col}`;
}

/**
 * @typedef {object} Annotation
 * @property {string} text
 * @property {"prefilled"|"manual"} source
 */

/**
 * Loads the annotation store from disk, or an empty object if it doesn't exist yet.
 * @param {string} outDir
 * @returns {Promise<Record<string, Annotation>>}
 */
export async function loadAnnotations(outDir) {
  const filePath = path.join(outDir, "annotations.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Writes the annotation store back to disk.
 * @param {string} outDir
 * @param {Record<string, Annotation>} annotations
 */
export async function saveAnnotations(outDir, annotations) {
  const filePath = path.join(outDir, "annotations.json");
  await fs.writeFile(filePath, JSON.stringify(annotations, null, 2));
}

/**
 * Merges parsed config-export button metadata into the annotation store as
 * "prefilled" entries. Never overwrites an existing "manual" annotation —
 * hand-written notes always win.
 *
 * @param {Record<string, Annotation>} annotations - existing store, mutated in place
 * @param {import("../config/parseExport.js").ButtonMeta[]} buttonMetas
 * @returns {Record<string, Annotation>}
 */
export function mergePrefill(annotations, buttonMetas) {
  for (const meta of buttonMetas) {
    const key = keyFor(meta.page, meta.row, meta.col);
    const existing = annotations[key];
    if (existing && existing.source === "manual") continue;

    const parts = [];
    if (meta.connections.length) parts.push(`Connection: ${meta.connections.join(", ")}`);
    if (meta.actionSummaries.length) parts.push(`Actions: ${meta.actionSummaries.join(", ")}`);

    annotations[key] = {
      text: parts.join(" — ") || "(no actions found)",
      source: "prefilled",
    };
  }
  return annotations;
}
