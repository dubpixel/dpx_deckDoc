// ================================================================================
// DEMO GENERATOR - builds the public, EDITABLE demo site from a real capture
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: scripts/generate-demo-site.js
// Purpose: Builds the public /demo/ site from a REAL captured device backup
//          (see backups/, gitignored, local-only). User reviewed the source
//          backup's content (page titles, prefill annotations) and confirmed
//          2026-09-24 it's fine to publish — no secrets, no real command
//          data of concern. device.json's host/port is scrubbed anyway (out
//          of caution — it's never read by buildSite() or published either
//          way). Runs the real buildSite() pipeline for the page/image
//          layout, then swaps in demo-template/'s EDITABLE viewer.js +
//          style.css in place of site-template/'s read-only ones — the real
//          handoff site stays intentionally static; only the public demo
//          lets a visitor click a button and edit it. Edits save to that
//          visitor's own localStorage only — never shared between visitors,
//          never written back to this repo. A "Reset Demo" button clears
//          them.
//          Re-run any time site-template/ or demo-template/ changes, or a
//          fresher/different real backup should be used as the source:
//            node scripts/generate-demo-site.js
// Dependencies: none
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "../src/site/build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const DEVICE_DIR = path.join(REPO_ROOT, "demo-src", "device");
const DEMO_TEMPLATE_DIR = path.join(REPO_ROOT, "demo-template");
const DEMO_OUT_DIR = path.join(REPO_ROOT, "demo");

// The real captured device this demo is built from — see AGENTS.md's
// "Real-device backups for building a better demo" note. User reviewed and
// approved publishing this specific backup's content (2026-09-24). Swap
// this path to point at a different backups/ snapshot if a different one
// should be used later — review its content first.
const SOURCE_BACKUP_DIR = path.join(
  REPO_ROOT,
  "backups",
  "8H_LOCAL_v3.5.1--10.196.191.1--2026-09-23"
);

async function copyRealDeviceData() {
  await fs.rm(DEVICE_DIR, { recursive: true, force: true });
  await fs.mkdir(DEVICE_DIR, { recursive: true });

  await fs.cp(path.join(SOURCE_BACKUP_DIR, "images"), path.join(DEVICE_DIR, "images"), { recursive: true });
  await fs.copyFile(path.join(SOURCE_BACKUP_DIR, "pages.json"), path.join(DEVICE_DIR, "pages.json"));
  await fs.copyFile(path.join(SOURCE_BACKUP_DIR, "annotations.json"), path.join(DEVICE_DIR, "annotations.json"));

  // manifest.json's image paths were baked relative to the ORIGINAL capture
  // location (devices/<slug>/images/...) — rewrite them to point at where
  // we just copied the images (demo-src/device/images/...).
  const manifest = JSON.parse(await fs.readFile(path.join(SOURCE_BACKUP_DIR, "manifest.json"), "utf8"));
  const rewritten = manifest.map((entry) => ({
    ...entry,
    image: path.join(DEVICE_DIR, "images", String(entry.page), path.basename(entry.image)),
  }));
  await fs.writeFile(path.join(DEVICE_DIR, "manifest.json"), JSON.stringify(rewritten, null, 2));

  // device.json (host/port) is never read by buildSite() and never
  // published, but skip copying it entirely out of caution — no real
  // network info should exist anywhere under demo-src/.
}

async function main() {
  await copyRealDeviceData();

  const result = await buildSite({ outDir: DEVICE_DIR });

  // Swap the real handoff site's read-only viewer for the demo's editable
  // one. Everything else buildSite() produced (HTML, images, favicon) is
  // reused as-is — the DOM shape is identical, only the JS/CSS differ.
  await fs.copyFile(path.join(DEMO_TEMPLATE_DIR, "viewer.js"), path.join(result.siteDir, "viewer.js"));
  await fs.copyFile(path.join(DEMO_TEMPLATE_DIR, "style.css"), path.join(result.siteDir, "style.css"));

  await fs.rm(DEMO_OUT_DIR, { recursive: true, force: true });
  await fs.cp(result.siteDir, DEMO_OUT_DIR, { recursive: true });

  console.log(`Demo site built from real capture: ${result.pageCount} pages, ${result.buttonCount} buttons -> ${DEMO_OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
