// ================================================================================
// DEMO GENERATOR - builds the dummy-data device the public /demo/ site is built from
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: scripts/generate-demo-site.js
// Purpose: Fabricates a small, fake Companion device (no real host, no real
//          show data, no Playwright/network involved) under demo-src/device/,
//          then runs the real buildSite() pipeline against it and copies the
//          frozen static output to /demo/ at the repo root for GitHub Pages.
//          Re-run this any time site-template/ or the demo content changes:
//            node scripts/generate-demo-site.js
// Dependencies: none (button "images" are hand-written SVGs, not captured PNGs)
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "../src/site/build.js";
import { resetManifest, appendManifest } from "../src/manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const DEVICE_DIR = path.join(REPO_ROOT, "demo-src", "device");
const DEMO_OUT_DIR = path.join(REPO_ROOT, "demo");

const ROWS = 4;
const COLS = 8;

// row/col -> { color, label } for the placeholder art. Anything not listed
// here renders as a plain blank slot (matches a real device's empty buttons).
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

function buttonSvg({ row, col, color, label }) {
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

// Structured annotations demonstrating every field, including labelOverride.
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

async function main() {
  await fs.rm(DEVICE_DIR, { recursive: true, force: true });
  await fs.mkdir(DEVICE_DIR, { recursive: true });
  await resetManifest(DEVICE_DIR);

  const pageTitles = {};
  for (const { page, title, buttons } of PAGES) {
    pageTitles[page] = title;
    const imagesDir = path.join(DEVICE_DIR, "images", String(page));
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
    await appendManifest(DEVICE_DIR, entries);
  }

  await fs.writeFile(path.join(DEVICE_DIR, "pages.json"), JSON.stringify(pageTitles, null, 2));
  await fs.writeFile(path.join(DEVICE_DIR, "annotations.json"), JSON.stringify(ANNOTATIONS, null, 2));

  const result = await buildSite({ outDir: DEVICE_DIR });

  await fs.rm(DEMO_OUT_DIR, { recursive: true, force: true });
  await fs.cp(result.siteDir, DEMO_OUT_DIR, { recursive: true });

  console.log(`Demo site built: ${result.pageCount} pages, ${result.buttonCount} buttons -> ${DEMO_OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
