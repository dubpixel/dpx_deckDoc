// ================================================================================
// CONFIG PARSER - Companion export (.companionconfig) reader
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/config/parseExport.js
// Purpose: Parses a Companion `.companionconfig` export (gzip-compressed JSON)
//          into a flat list of per-button metadata — heading (the button's own
//          text), a plain-English description of what it does, and the raw
//          connection/action names — used to pre-fill annotations.
// Dependencies: zlib (built in), ./describe.js
//
// THREE EXPORT GENERATIONS ARE SUPPORTED (each confirmed against a real export):
//
//   v12 (Companion 4.3.4 and 5.0.x) — `pages[n].controls[row][col]`, actions at
//     `control.steps["0"].action_sets.down`, each
//     `{type:"action", definitionId, connectionId, options}` where each option
//     is wrapped `{value, isExpression}`. 4.3.4 buttons are `type:"button"` with
//     `style.text`; 5.0.x buttons are `type:"button-layered"` with the text in a
//     `style.layers[]` entry of type "text". (Before this was handled, every
//     5.0 button was mislabeled "Built-in control" — only pageup/pagedown/
//     pagenum are truly built-in.) `data.instances[id].label` names the connection.
//   v6 (Companion ~3.5) — same page/row/col nesting, but actions are
//     `{action, instance, options}` with plain (unwrapped) option values.
//   v3 (Companion 3.0) — no per-page controls; a top-level `controls` map keyed
//     `"bank:<page>-<bank>"` (bank 1..32 on an 8-column grid, row-major),
//     actions `{action, instance, options}`, feedbacks `{type, instance_id}`.
//
// ================================================================================

import fs from "node:fs/promises";
import zlib from "node:zlib";
import { describeButton } from "./describe.js";

/**
 * @typedef {object} ButtonMeta
 * @property {number} page
 * @property {number} row
 * @property {number} col
 * @property {string} controlType - "button" for any configurable button; Companion's own "pageup"/"pagedown"/"pagenum" for built-ins
 * @property {string[]} connections - distinct connection labels used (button type only)
 * @property {string[]} actionSummaries - raw action names, in order (button type only)
 * @property {string} command - raw technical summary ("Connection: X — Actions: a, b")
 * @property {string} heading - the button's own on-face text, cleaned; "" if none/unknowable
 * @property {string} body - plain-English description of what pressing it does; "" if nothing to say
 * @property {string} note - Companion's own per-button notes field, if the user filled one in
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
const NATIVE_HEADING = { pageup: "Page up", pagedown: "Page down", pagenum: "Page number" };

// Companion 3.0's fixed bank grid (see header): 8 columns, row-major.
const V3_COLUMNS = 8;

async function loadExportData(filePath) {
  const raw = await fs.readFile(filePath);
  const json = looksGzipped(raw) ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return JSON.parse(json);
}

/** v12 wraps every option as {value, isExpression}; older exports use plain values. */
function flattenOptions(options) {
  const out = {};
  for (const [k, v] of Object.entries(options ?? {})) {
    if (v && typeof v === "object" && "isExpression" in v && "value" in v) {
      out[k] = v.isExpression ? { __expression: true } : v.value;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Normalizes an action or feedback from any export generation to one shape. */
function normalize(item, instances) {
  const connId = item.connectionId ?? item.instance ?? item.instance_id;
  const internal = connId === "internal";
  return {
    def: item.definitionId ?? item.action ?? item.type ?? "unknown-action",
    connLabel: internal ? "" : (instances[connId]?.label ?? connId ?? ""),
    internal,
    opts: flattenOptions(item.options),
  };
}

/** Cleans button face text: Companion stores a line break as a literal "\\n" or a real newline. */
function cleanText(t) {
  return String(t ?? "").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Extracts the button's own text. Returns "" when it's an expression
 * (can't be evaluated offline) or simply absent.
 */
function headingFor(control) {
  if (typeof control.style?.text === "string") {
    return control.style.textExpression ? "" : cleanText(control.style.text);
  }
  const layer = (control.style?.layers ?? []).find((l) => l.type === "text" && l.enabled?.value !== false);
  if (!layer || layer.text?.isExpression) return "";
  return cleanText(layer.text?.value);
}

/** Builds one ButtonMeta for a configurable button (any generation). */
function buttonMeta(page, row, col, control, instances) {
  const stepList = Object.keys(control.steps ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => control.steps[k]?.action_sets ?? {});
  const steps = stepList.map((sets) => ({
    down: (Array.isArray(sets.down) ? sets.down : []).map((a) => normalize(a, instances)),
    up: (Array.isArray(sets.up) ? sets.up : []).map((a) => normalize(a, instances)),
  }));
  const feedbacks = (control.feedbacks ?? []).map((f) => normalize(f, instances));

  // `command` keeps describing the first step's press-down actions, exactly
  // as before this module learned to describe things in English.
  const downActions = steps[0]?.down ?? [];
  const connections = [...new Set(downActions.map((a) => a.connLabel).filter(Boolean))];
  const actionSummaries = downActions.map((a) => a.def);
  const parts = [];
  if (connections.length) parts.push(`Connection: ${connections.join(", ")}`);
  if (actionSummaries.length) parts.push(`Actions: ${actionSummaries.join(", ")}`);

  return {
    page, row, col,
    controlType: "button",
    connections,
    actionSummaries,
    command: parts.join(" — ") || "(no actions configured)",
    heading: headingFor(control),
    body: describeButton({ steps, feedbacks }),
    note: typeof control.options?.notes === "string" ? control.options.notes.trim() : "",
  };
}

function nativeMeta(page, row, col, type) {
  return {
    page, row, col,
    controlType: type,
    connections: [],
    actionSummaries: [],
    command: NATIVE_CONTROL_LABEL[type] ?? `Built-in control: ${type}`,
    heading: NATIVE_HEADING[type] ?? "",
    body: "",
    note: "",
  };
}

// Any of Companion's configurable button types ("button", "button-layered", ...).
const isConfigurableButton = (type) => type === "button" || type?.startsWith("button-");

/**
 * Parses a .companionconfig export file (gzip-compressed JSON) into a flat
 * array of ButtonMeta.
 * @param {string} filePath
 * @returns {Promise<ButtonMeta[]>}
 */
export async function parseCompanionExport(filePath) {
  const data = await loadExportData(filePath);
  const instances = data.instances ?? {};
  const results = [];

  for (const [pageKey, pageVal] of Object.entries(data.pages ?? {})) {
    const page = Number(pageKey);
    for (const [rowKey, rowVal] of Object.entries(pageVal.controls ?? {})) {
      const row = Number(rowKey);
      for (const [colKey, control] of Object.entries(rowVal)) {
        const col = Number(colKey);
        if (!control?.type) continue;
        results.push(
          isConfigurableButton(control.type)
            ? buttonMeta(page, row, col, control, instances)
            : nativeMeta(page, row, col, control.type)
        );
      }
    }
  }

  // v3 layout: top-level `controls` keyed "bank:<page>-<bank>".
  for (const [key, control] of Object.entries(data.controls ?? {})) {
    const m = /^bank:(\d+)-(\d+)$/.exec(key);
    if (!m || !control?.type || !isConfigurableButton(control.type)) continue;
    const page = Number(m[1]);
    const idx = Number(m[2]) - 1;
    results.push(buttonMeta(page, Math.floor(idx / V3_COLUMNS), idx % V3_COLUMNS, control, instances));
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
