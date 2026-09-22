// ================================================================================
// CONFIG PARSER - Companion export (.companionconfig) reader
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/config/parseExport.js
// Purpose: Parses a Companion `.companionconfig` export (gzip-compressed JSON)
//          into a flat list of per-button metadata (connection label, action
//          names) used to pre-fill annotations.
// Dependencies: none (zlib is built in)
//
// SCHEMA CONFIRMED 2026-09-22 against a real export pulled from
// http://127.0.0.1:8000/int/export/full (Companion 4.3.4, export version 12):
//   - the file is gzip-compressed JSON (not plain JSON)
//   - `pages[pageNum].controls[row][col]` — controls are nested two levels
//     deep (row, then col), not a flat "row/col" key
//   - a button's actions live at `control.steps["0"].action_sets.down`,
//     each action shaped `{ type: "action", definitionId, connectionId, options }`
//   - `definitionId` is the action's human-meaningful name (e.g. "cue"),
//     not `action`/`actionId` as originally guessed
//   - `data.instances[connectionId].label` gives the connection's display
//     name (e.g. "101-stage2-LW") — connectionId alone is an opaque id
//
// ================================================================================

import fs from "node:fs/promises";
import zlib from "node:zlib";

/**
 * @typedef {object} ButtonMeta
 * @property {number} page
 * @property {number} row
 * @property {number} col
 * @property {string} controlType - Companion's own control type: "button", "pageup", "pagedown", "pagenum"
 * @property {string[]} connections - distinct connection labels used (button type only)
 * @property {string[]} actionSummaries - short human-readable action descriptions (button type only)
 */

// Companion's own built-in control type names, taken directly from the
// export's `type` field — not a guess at click behavior, just naming what
// type of native control this is (Companion's tablet UI renders these as
// the page up/down/number buttons in the leftmost column).
const NATIVE_CONTROL_LABEL = {
  pageup: "Built-in control: page-up navigation button",
  pagedown: "Built-in control: page-down navigation button",
  pagenum: "Built-in control: page-number button",
};

async function loadExportData(filePath) {
  const raw = await fs.readFile(filePath);
  const json = looksGzipped(raw) ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return JSON.parse(json);
}

/**
 * Parses a .companionconfig export file (gzip-compressed JSON) into a flat
 * array of ButtonMeta.
 * @param {string} filePath
 * @returns {Promise<ButtonMeta[]>}
 */
export async function parseCompanionExport(filePath) {
  const data = await loadExportData(filePath);

  const instances = data.instances ?? {};
  const labelFor = (connectionId) => instances[connectionId]?.label ?? connectionId;

  const results = [];

  for (const [pageKey, pageVal] of Object.entries(data.pages ?? {})) {
    const page = Number(pageKey);
    const controls = pageVal.controls ?? {};

    for (const [rowKey, rowVal] of Object.entries(controls)) {
      const row = Number(rowKey);
      for (const [colKey, control] of Object.entries(rowVal)) {
        const col = Number(colKey);
        if (!control?.type) continue;

        if (control.type !== "button") {
          // Native page-nav controls — always emit a factual entry, sourced
          // directly from the export's own `type` field, so these buttons
          // aren't silently left with no command text.
          results.push({
            page, row, col,
            controlType: control.type,
            connections: [],
            actionSummaries: [],
            command: NATIVE_CONTROL_LABEL[control.type] ?? `Built-in control: ${control.type}`,
          });
          continue;
        }

        const actions = control.steps?.["0"]?.action_sets?.down ?? [];
        const connections = [...new Set(actions.map((a) => labelFor(a.connectionId)).filter(Boolean))];
        const actionSummaries = actions.map((a) => a.definitionId ?? "unknown-action");

        const parts = [];
        if (connections.length) parts.push(`Connection: ${connections.join(", ")}`);
        if (actionSummaries.length) parts.push(`Actions: ${actionSummaries.join(", ")}`);

        results.push({
          page, row, col,
          controlType: "button",
          connections,
          actionSummaries,
          command: parts.join(" — ") || "(no actions configured)",
        });
      }
    }
  }

  return results;
}

/**
 * Parses a .companionconfig export file into a map of page number -> page
 * name (Companion's own page title, e.g. "quick", "look 2 mono").
 * @param {string} filePath
 * @returns {Promise<Record<number, string>>}
 */
export async function parsePageTitles(filePath) {
  const data = await loadExportData(filePath);
  const titles = {};
  for (const [pageKey, pageVal] of Object.entries(data.pages ?? {})) {
    if (pageVal.name) titles[Number(pageKey)] = pageVal.name;
  }
  return titles;
}

function looksGzipped(buf) {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}
