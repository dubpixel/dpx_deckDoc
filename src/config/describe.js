// ================================================================================
// CONFIG DESCRIBER - turns Companion actions/feedbacks into plain English
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/config/describe.js
// Purpose: Given a button's actions/feedbacks (already normalized by
//          parseExport.js), produce a readable one-paragraph description of
//          what pressing it does, so annotations start pre-written instead of
//          blank. Everything here is derived from the export's own data —
//          nothing is invented. Anything not recognized falls back to a
//          humanized "<action name> (key=value, ...)" form rather than guessing.
// Dependencies: none
//
// DESIGN NOTES:
//   - Templates key on the action's `definitionId` AND require the option keys
//     they need to actually be present. Module authors reuse names like "cue"
//     or "route" with different options; a template that only matched on the
//     name would mislabel another module's action. No keys -> generic fallback.
//   - Options that are Companion expressions (isExpression) can't be evaluated
//     offline, so they're shown as "(expression)" instead of a wrong value.
//
// ================================================================================

const MAX_OPTION_VALUE_LEN = 40;
const MAX_GENERIC_OPTIONS = 3;
// A run of identical actions (e.g. a button routing 32 crosspoints) is shown as
// the first few plus a count, so one button can't produce a wall of text.
const RUN_SHOW = 3;

/** "play_to_end" / "playSection" -> "play to end" / "play section" */
export function humanize(name) {
  return String(name ?? "unknown action")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function fmt(v) {
  if (v && typeof v === "object" && v.__expression) return "(expression)";
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "(empty)";
  return s.length > MAX_OPTION_VALUE_LEN ? s.slice(0, MAX_OPTION_VALUE_LEN - 1) + "…" : s;
}

const has = (o, ...keys) => keys.every((k) => k in o);

/**
 * Describes one normalized action as a short phrase (no connection suffix).
 * @param {{def:string, connLabel:string, internal:boolean, opts:Record<string,any>}} a
 */
export function describeAction(a) {
  const { def, opts } = a;

  if (a.internal) {
    if (def === "set_page" && has(opts, "page")) return `Go to page ${fmt(opts.page)}`;
    if (def === "wait" && has(opts, "time")) return `Wait ${fmt(opts.time)} ms`;
    if (def === "custom_variable_set_value" && has(opts, "name", "value")) {
      return `Set custom variable "${fmt(opts.name)}" to ${fmt(opts.value)}`;
    }
  }

  if (def === "xpt" && has(opts, "input", "output")) return `Route ${fmt(opts.input)} → ${fmt(opts.output)}`;
  if (def === "route" && has(opts, "source", "destination")) return `Route source ${fmt(opts.source)} → destination ${fmt(opts.destination)}`;
  if (def === "cue" && has(opts, "command", "track")) {
    const where = opts.location !== undefined && opts.location !== "" ? ` @ ${fmt(opts.location)}` : "";
    return `Cue: ${humanize(opts.command)} on track ${fmt(opts.track)}${where}`;
  }
  if (/^send_/.test(def) && has(opts, "path")) {
    const valueKey = Object.keys(opts).find((k) => k !== "path");
    return valueKey ? `Send ${fmt(opts.path)} = ${fmt(opts[valueKey])}` : `Send ${fmt(opts.path)}`;
  }

  // Generic fallback: humanized name + a few key=value pairs, if any.
  const pairs = Object.entries(opts).slice(0, MAX_GENERIC_OPTIONS).map(([k, v]) => `${k}=${fmt(v)}`);
  const more = Object.keys(opts).length > MAX_GENERIC_OPTIONS ? ", …" : "";
  const base = humanize(def);
  const label = base.charAt(0).toUpperCase() + base.slice(1);
  return pairs.length ? `${label} (${pairs.join(", ")}${more})` : label;
}

/** Appends " [connection]" for non-internal actions, so the module is visible. */
function withConn(phrase, a) {
  return a.internal || !a.connLabel ? phrase : `${phrase} [${a.connLabel}]`;
}

/**
 * Describes an ordered list of normalized actions as one readable string,
 * collapsing long runs of the same action on the same connection.
 * @returns {string} "" when the list is empty
 */
export function describeActions(actions) {
  const out = [];
  let i = 0;
  while (i < actions.length) {
    let j = i;
    while (j < actions.length && actions[j].def === actions[i].def && actions[j].connLabel === actions[i].connLabel) j++;
    const run = actions.slice(i, j);
    if (run.length > RUN_SHOW) {
      const shown = run.slice(0, RUN_SHOW).map(describeAction).join("; ");
      const first = run[0];
      const tail = first.internal || !first.connLabel ? "" : ` [${first.connLabel}]`;
      out.push(`${humanize(first.def)} ×${run.length}${tail}: ${shown}; +${run.length - RUN_SHOW} more`);
    } else {
      for (const a of run) out.push(withConn(describeAction(a), a));
    }
    i = j;
  }
  return out.join(", then ");
}

/**
 * Builds the full plain-English body for a button.
 * @param {{ steps: {down:object[], up:object[]}[], feedbacks: {def:string, connLabel:string, internal:boolean}[] }} spec
 * @returns {string} "" when there's nothing to say
 */
export function describeButton({ steps, feedbacks }) {
  const sentences = [];
  const multi = steps.length > 1;
  steps.forEach((step, idx) => {
    const prefix = multi ? `Step ${idx + 1}: ` : "";
    const down = describeActions(step.down);
    const up = describeActions(step.up);
    if (down) sentences.push(`${prefix}${down}.`);
    if (up) sentences.push(`${prefix}On release: ${up}.`);
  });
  const fbNames = [...new Set(feedbacks.map((f) => withConn(humanize(f.def), f)))];
  if (fbNames.length) sentences.push(`Button state follows: ${fbNames.join(", ")}.`);
  return sentences.join(" ");
}
