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
// SCHEMA (revised 2026-09-22): an annotation is no longer a single opaque
// text blob — it's structured into HEADING / BODY / NOTICE / NOTE / COMMAND
// fields so the viewer can style them distinctly (heading bold, notice in
// red, note in italics). `command` holds the raw technical prefill
// (connection + action names straight from the `.companionconfig` export);
// `body` is reserved for the human-written, "decyphered" explanation of
// what the button actually does — prefill NEVER touches `body`, only
// `command`. heading/notice/note are always left for the user to fill in
// by hand too.
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";

export function keyFor(page, row, col) {
  return `${page}/${row}/${col}`;
}

/**
 * @typedef {object} Annotation
 * @property {string} heading
 * @property {string} body - human-written, "decyphered" explanation; never auto-filled
 * @property {string} notice
 * @property {string} note
 * @property {string} command - raw technical prefill (connection/action names)
 * @property {string} labelOverride - replaces the button's captured on-image text in the deck view; never auto-filled
 * @property {"prefilled"|"manual"} source
 */

const BLANK = { heading: "", body: "", notice: "", note: "", command: "", labelOverride: "" };

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
 * "prefilled" entries (`body` only). Never overwrites an existing "manual"
 * annotation — hand-written notes always win, field by field.
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

    annotations[key] = {
      ...BLANK,
      command: meta.command,
      source: "prefilled",
    };
  }
  return annotations;
}

/**
 * Applies a manual (hand-written) edit to one button's annotation. Always
 * wins over prefill, and always marks the entry "manual" so future prefill
 * merges leave it alone.
 *
 * @param {Record<string, Annotation>} annotations - mutated in place
 * @param {{page:number, row:number, col:number, heading?:string, body?:string, notice?:string, note?:string, command?:string, labelOverride?:string}} edit
 */
export function applyManualEdit(annotations, edit) {
  const key = keyFor(edit.page, edit.row, edit.col);
  const existing = annotations[key] ?? { ...BLANK };
  annotations[key] = {
    heading: edit.heading ?? existing.heading ?? "",
    body: edit.body ?? existing.body ?? "",
    notice: edit.notice ?? existing.notice ?? "",
    note: edit.note ?? existing.note ?? "",
    command: edit.command ?? existing.command ?? "",
    labelOverride: edit.labelOverride ?? existing.labelOverride ?? "",
    source: "manual",
  };
  return annotations[key];
}
