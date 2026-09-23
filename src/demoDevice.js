// ================================================================================
// DEMO DEVICE - seeds a fabricated local device for the "try it locally" path
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/demoDevice.js
// Purpose: Fabricates a small fake Companion device (hand-written SVG
//          placeholder buttons, structured annotations, no network calls,
//          no real Companion instance) directly under a devices root, so a
//          newcomer can run `node src/cli.js demo` and see a working
//          editor/site within seconds of installing, with zero setup.
//          Adapted from scripts/generate-demo-site.js's pattern (same
//          button/annotation data), but writes into a live devices/<slug>
//          directory instead of demo-src/device/ + a frozen /demo/ copy, so
//          `serve` picks it up like any other scraped device.
// Dependencies: none (button "images" are hand-written SVGs, not captured
//          PNGs, and no fetch/network call is made anywhere in this file)
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { resetManifest, appendManifest } from "./manifest.js";
import { saveAnnotations } from "./annotate/store.js";

const ROWS = 4;
const COLS = 8;

// row/col -> { color, label } for the placeholder art. Anything not listed
// here renders as a plain blank slot (matches a real device's empty buttons).
// Same fixture data as scripts/generate-demo-site.js's public demo, kept in
// sync deliberately so both "try it locally" and the public demo site look
// the same to anyone comparing them.
const PAGE_1_BUTTONS = {
  "0/0": { color: "#2f7a3d", label: "GO\nLIVE" },
  "0/1": { color: "#7a2f2f", label: "STANDBY" },
  "0/2": { color: "#2f4f7a", label: "CAM 1" },
  "0/3": { color: "#2f4f7a", label: "CAM 2" },
  "1/0": { color: "#5a2f7a", label: "MUTE\nPGM" },
  "1/1": { color: "#7a6a2f", label: "OSC\nCUE 12" },
  "2/4": { color: "#2f7a6a", label: "LOWER\nTHIRD" },
};

const PAGE_2_BUTTONS = {
  "0/0": { color: "#2f4f7a", label: "CAM 3" },
  "0/1": { color: "#2f4f7a", label: "CAM 4" },
  "0/2": { color: "#7a2f2f", label: "RECORD" },
  "1/5": { color: "#7a6a2f", label: "vMix\nOVERLAY" },
  "3/7": { color: "#5a2f7a", label: "ALL\nSTOP" },
};

const PAGES = [
  { page: 1, title: "Stream Control", buttons: PAGE_1_BUTTONS },
  { page: 2, title: "Camera Switching", buttons: PAGE_2_BUTTONS },
];

const ANNOTATIONS = {
  "1/0/0": {
    heading: "Take Program",
    body: "Cuts the current preview bus to program. This is the main \"go live\" trigger for the show.",
    command: "vMix: Cut(Input=1)",
    source: "manual",
  },
  "1/0/1": {
    heading: "Standby",
    body: "Parks the switcher on the standby slate between segments.",
    notice: "Do not use during a live segment — this will cut to black on air.",
    command: "vMix: Cut(Input=Standby)",
    source: "manual",
  },
  "1/1/0": {
    heading: "Program Mute",
    body: "Toggles the program audio bus.",
    note: "Toggle, not momentary — check the tally before walking away.",
    command: "OSC: /mute/pgm 1",
    source: "manual",
  },
  "1/1/1": {
    heading: "Cue 12",
    body: "Fires QLab cue 12 (intro sting).",
    command: "OSC: /cue/12/start",
    source: "manual",
  },
  "1/2/4": {
    heading: "Lower Third",
    body: "Shows the current speaker's lower-third graphic.",
    labelOverride: "L3: SPEAKER",
    command: "disguise: trigger cue \"lower_third_in\"",
    source: "manual",
  },
  "2/1/5": {
    heading: "Overlay Toggle",
    body: "Shows/hides the vMix overlay channel used for sponsor bugs.",
    command: "vMix: OverlayInput1In",
    source: "manual",
  },
  "2/3/7": {
    heading: "All Stop",
    body: "Kills every running OSC cue across all connections — the panic button.",
    notice: "Use only if a cue is stuck or misfiring; this does not just pause, it stops everything.",
    command: "OSC: /allstop",
    source: "manual",
  },
};

/** @returns {string} an inline SVG placeholder for one button slot */
export function buttonSvg({ row, col, color, label }) {
  const fill = color ?? "#20242b";
  const stroke = color ? "#00000055" : "#3a4048";
  const text = (label ?? `${row}/${col}`)
    .split("\n")
    .map((line, i) => `<tspan x="48" dy="${i === 0 ? 0 : 14}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
  <rect width="96" height="96" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <text x="48" y="${label ? 42 : 52}" font-family="sans-serif" font-size="11" fill="#f4f4f4" text-anchor="middle">${text}</text>
</svg>`;
}

function escapeXml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Pure description of the fabricated demo device's page/button/annotation
 * data, with no filesystem access — kept separate from seedDemoDevice() so
 * it can be asserted against directly in tests without touching disk.
 */
export function demoFixture() {
  return { pages: PAGES, annotations: ANNOTATIONS, rows: ROWS, cols: COLS };
}

/**
 * Writes a fabricated demo device (manifest.json, pages.json,
 * annotations.json, device.json + SVG button images) directly into
 * `devicesRoot/<deviceSlug>`, in the same on-disk shape `scrapeDevice()`
 * produces, so `serve`/`build` can't tell it apart from a real scrape.
 *
 * No network call is made anywhere in this function — this is the "try it
 * locally" path from issue #9, and per AGENTS.md it must never guess at or
 * contact a real Companion host.
 *
 * @param {object} opts
 * @param {string} [opts.devicesRoot] - root dir devices live under, default "devices"
 * @param {string} [opts.deviceSlug] - device slug, default "demo"
 * @returns {Promise<{device: string, outDir: string, pageCount: number, buttonCount: number}>}
 */
export async function seedDemoDevice({ devicesRoot = "devices", deviceSlug = "demo" } = {}) {
  const outDir = path.join(devicesRoot, deviceSlug);
  await fs.mkdir(outDir, { recursive: true });
  await resetManifest(outDir);

  const pageTitles = {};
  let buttonCount = 0;
  for (const { page, title, buttons } of PAGES) {
    pageTitles[page] = title;
    const imagesDir = path.join(outDir, "images", String(page));
    await fs.mkdir(imagesDir, { recursive: true });

    const entries = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const key = `${row}/${col}`;
        const btn = buttons[key];
        const imagePath = path.join(imagesDir, `${row}-${col}.svg`);
        await fs.writeFile(imagePath, buttonSvg({ row, col, ...btn }));
        entries.push({ page, row, col, image: imagePath });
      }
    }
    await appendManifest(outDir, entries);
    buttonCount += entries.length;
  }

  await fs.writeFile(path.join(outDir, "pages.json"), JSON.stringify(pageTitles, null, 2));
  await saveAnnotations(outDir, ANNOTATIONS);

  // Not a real scrape, so there's no real host — device.json's host/port are
  // clearly labeled fake so nobody mistakes this for a live instance.
  const deviceMeta = { host: "demo (no real device)", port: null, scrapedAt: new Date().toISOString() };
  await fs.writeFile(path.join(outDir, "device.json"), JSON.stringify(deviceMeta, null, 2));

  return { device: deviceSlug, outDir, pageCount: PAGES.length, buttonCount };
}
