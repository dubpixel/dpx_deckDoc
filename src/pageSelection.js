// ================================================================================
// PAGE SELECTION - include/exclude pages from the nav and static build
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/pageSelection.js
// Purpose: Tracks which captured pages are "included" (shown in the editor
//          nav, emitted by `build`) vs. excluded (e.g. blank placeholder
//          pages in a large instance like the 99-page dev rig, most of
//          which are literally titled "PAGE" and empty). Defaults to
//          included — a page with no explicit entry is shown, so existing
//          devices don't lose pages just because this file didn't exist yet.
// Dependencies: none
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";

export async function loadPageSelection(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "page-selection.json"), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export async function savePageSelection(dir, selection) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "page-selection.json"), JSON.stringify(selection, null, 2));
}

/**
 * A page is included unless explicitly set to false.
 */
export function isIncluded(selection, page) {
  return selection[String(page)] !== false;
}
