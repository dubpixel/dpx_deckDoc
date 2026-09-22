// ================================================================================
// CONFIG PARSER - Companion export (.companionconfig) reader
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/config/parseExport.js
// Purpose: Parses a Companion `.companionconfig` export (JSON) into a flat
//          list of per-button metadata (connection label, action names) used
//          to pre-fill annotations.
// Dependencies: none
//
// NOTE: Bitfocus doesn't publish a stable public schema for this file, and
// it varies across Companion versions. The shape assumed below (`pages` ->
// controls keyed by "row/col" -> `config.instance` / `config.actions`) is
// based on the general structure Companion's own export/import code walks,
// but has NOT yet been validated against a real export from the v5+ series.
// TREAT THIS AS UNVERIFIED until run against an actual export pulled from
// the dev Companion instance (10.196.11.26) — adjust field names to match
// once we have a real file to look at.
//
// ================================================================================

import fs from "node:fs/promises";

/**
 * @typedef {object} ButtonMeta
 * @property {number} page
 * @property {number} row
 * @property {number} col
 * @property {string[]} connections - distinct connection/instance labels used
 * @property {string[]} actionSummaries - short human-readable action descriptions
 */

/**
 * Parses a .companionconfig export file into a flat array of ButtonMeta.
 * @param {string} filePath
 * @returns {Promise<ButtonMeta[]>}
 */
export async function parseCompanionExport(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);

  const pagesObj = data.pages ?? data.pagesData ?? {};
  const results = [];

  for (const [pageKey, pageVal] of Object.entries(pagesObj)) {
    const page = Number(pageKey);
    const controls = pageVal.controls ?? pageVal.buttons ?? {};

    for (const [locKey, control] of Object.entries(controls)) {
      if (!control) continue;
      const [row, col] = locKey.split("/").map(Number);

      const actions = control.steps?.["0"]?.action_sets?.down
        ?? control.actions
        ?? [];

      const connections = [
        ...new Set(
          actions
            .map((a) => a.instance ?? a.instance_id ?? a.connectionId)
            .filter(Boolean)
        ),
      ];

      const actionSummaries = actions.map((a) => a.action ?? a.actionId ?? "unknown-action");

      if (connections.length || actionSummaries.length) {
        results.push({ page, row, col, connections, actionSummaries });
      }
    }
  }

  return results;
}
