// ================================================================================
// TEST - src/config/describe.js + multi-generation parseExport.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// Fixtures are shaped like the three real export generations (see
// parseExport.js's header). The 5.0 "button-layered" case is a regression
// test: it used to be mislabeled "Built-in control", silently producing no
// useful prefill for every button on a Companion 5.0 instance.
//
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describeAction, describeActions, describeButton, humanize } from "../src/config/describe.js";
import { parseCompanionExport } from "../src/config/parseExport.js";

const act = (def, opts = {}, conn = "Mod", internal = false) => ({ def, connLabel: conn, internal, opts });

describe("describeAction", () => {
  test("templates apply only when the option keys they need are present", () => {
    assert.equal(describeAction(act("xpt", { input: "I1", output: "O9" })), "Route I1 → O9");
    // same action name, different module/options: must NOT be mislabeled as a route
    assert.match(describeAction(act("xpt", { foo: "bar" })), /^Xpt \(foo=bar\)$/);
  });

  test("internal set_page / wait", () => {
    assert.equal(describeAction(act("set_page", { page: 5 }, "", true)), "Go to page 5");
    assert.equal(describeAction(act("wait", { time: "100" }, "", true)), "Wait 100 ms");
  });

  test("expression options are never shown as a (wrong) value", () => {
    assert.equal(describeAction(act("set_page", { page: { __expression: true } }, "", true)), "Go to page (expression)");
  });

  test("generic fallback humanizes the name", () => {
    assert.equal(describeAction(act("play_to_end")), "Play to end");
    assert.equal(humanize("playSection"), "play section");
  });
});

describe("describeActions / describeButton", () => {
  test("long runs of the same action collapse to a count", () => {
    const run = Array.from({ length: 10 }, (_, i) => act("xpt", { input: `I${i}`, output: `O${i}` }, "LW"));
    const text = describeActions(run);
    assert.match(text, /×10/);
    assert.match(text, /\+7 more/);
    assert.ok(text.length < 250);
  });

  test("steps, release actions and feedback are all described", () => {
    const text = describeButton({
      steps: [
        { down: [act("play_to_end", {}, "d3")], up: [act("stop", {}, "d3")] },
        { down: [act("stop", {}, "d3")], up: [] },
      ],
      feedbacks: [act("playMode", {}, "d3")],
    });
    assert.match(text, /Step 1: Play to end \[d3\]\./);
    assert.match(text, /On release: Stop \[d3\]/);
    assert.match(text, /Step 2:/);
    assert.match(text, /Button state follows: play mode \[d3\]/);
  });

  test("nothing configured -> empty string, never invented text", () => {
    assert.equal(describeButton({ steps: [{ down: [], up: [] }], feedbacks: [] }), "");
  });
});

const wrap = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, isExpression: false }]));

async function parseFixture(data) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deckdoc-describe-"));
  try {
    const f = path.join(dir, "e.companionconfig");
    await fs.writeFile(f, JSON.stringify(data));
    return await parseCompanionExport(f);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("parseCompanionExport across export generations", () => {
  test("v12 button-layered (Companion 5.0) is a real button, with heading + body from the layers", async () => {
    const r = await parseFixture({
      version: 12,
      instances: { c1: { label: "d3osc", moduleId: "disguise-osc" } },
      pages: { 1: { controls: { 0: {
        0: { type: "pageup" },
        1: {
          type: "button-layered",
          style: { layers: [
            { type: "canvas" },
            { type: "text", enabled: { value: true }, text: { value: "STOP\\nHSE", isExpression: false } },
          ] },
          options: { notes: "  careful  " },
          feedbacks: [],
          steps: { 0: { action_sets: { down: [{ definitionId: "stop", connectionId: "c1", options: {} }], up: [] } } },
        },
      } } } },
    });
    const b = r.find((x) => x.col === 1);
    assert.equal(b.controlType, "button");
    assert.equal(b.heading, "STOP HSE");
    assert.equal(b.body, "Stop [d3osc].");
    assert.equal(b.note, "careful");
    assert.equal(r.find((x) => x.col === 0).heading, "Page up");
  });

  test("v12 expression text is not shown as a heading", async () => {
    const r = await parseFixture({
      version: 12, instances: {},
      pages: { 1: { controls: { 0: { 0: { type: "button-layered", style: { layers: [
        { type: "text", text: { value: "$(x:y) + 1", isExpression: true } },
      ] }, steps: {}, feedbacks: [] } } } } },
    });
    assert.equal(r[0].heading, "");
  });

  test("v6 (action/instance, plain options) is described, not left as 'unknown-action'", async () => {
    const r = await parseFixture({
      version: 6,
      instances: { i1: { label: "LW", instance_type: "lightware-lw3" } },
      pages: { 1: { controls: { 0: { 0: {
        type: "button", style: { text: "S1" }, feedbacks: [],
        steps: { 0: { action_sets: { down: [{ action: "xpt", instance: "i1", options: { input: "I1", output: "O2" } }] } } },
      } } } } },
    });
    assert.equal(r[0].body, "Route I1 → O2 [LW].");
    assert.deepEqual(r[0].actionSummaries, ["xpt"]);
    assert.deepEqual(r[0].connections, ["LW"]);
  });

  test("v3 top-level 'bank:<page>-<n>' controls map to page/row/col on an 8-wide grid", async () => {
    const r = await parseFixture({
      version: 3,
      instances: { i1: { label: "LW" } },
      pages: { 1: { name: "base" } },
      controls: {
        "bank:1-1": { type: "button", style: { text: "A" }, steps: {}, feedbacks: [] },
        "bank:1-9": { type: "button", style: { text: "B" }, steps: {}, feedbacks: [] },
        "bank:2-32": { type: "button", style: { text: "C" }, steps: {}, feedbacks: [] },
      },
    });
    const at = (p, row, col) => r.find((x) => x.page === p && x.row === row && x.col === col)?.heading;
    assert.equal(at(1, 0, 0), "A");
    assert.equal(at(1, 1, 0), "B");
    assert.equal(at(2, 3, 7), "C");
  });
});
