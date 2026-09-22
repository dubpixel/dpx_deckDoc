#!/usr/bin/env node
// ================================================================================
// CLI - dpx_deckDoc entry point
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/cli.js
// Purpose: `capture`, `annotate`, `build` subcommands tying the capture
//          backends, config parser, annotation store, and site generator
//          together. No build step — run directly with `node src/cli.js`.
// Dependencies: playwright (screenshot mode only)
//
// ================================================================================

import path from "node:path";
import fs from "node:fs/promises";
import { captureSatellitePage } from "./capture/satellite.js";
import { captureScreenshotPage } from "./capture/screenshot.js";
import { parseCompanionExport, parsePageTitles } from "./config/parseExport.js";
import { loadAnnotations, saveAnnotations, mergePrefill } from "./annotate/store.js";
import { buildSite } from "./site/build.js";
import { serve } from "./serve.js";
import { appendManifest } from "./manifest.js";
import { scrapeDevice } from "./scrape.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

async function cmdCapture(args) {
  const outDir = args.out ?? "output";
  const page = Number(args.page ?? 1);

  if (args.mode === "satellite") {
    if (!args.host) throw new Error("--host is required for satellite mode");
    const rows = Number(args.rows ?? 4);
    const cols = Number(args.cols ?? 8);
    const imgDir = path.join(outDir, "images", String(page));
    const result = await captureSatellitePage({
      host: args.host,
      page,
      rows,
      cols,
      outDir: imgDir,
    });
    const entries = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        entries.push({ page, row, col, image: path.join(imgDir, `${row}-${col}.png`) });
      }
    }
    await appendManifest(outDir, entries);
    console.log(`Captured ${result.count} buttons on page ${page} via Satellite API`);
  } else if (args.mode === "screenshot") {
    if (!args.url) throw new Error("--url is required for screenshot mode");
    const imgDir = path.join(outDir, "images", String(page));
    const result = await captureScreenshotPage({
      url: args.url,
      outDir: imgDir,
      page,
    });
    const entries = result.buttons.map((b) => ({ page, row: b.row, col: b.col, image: b.path }));
    await appendManifest(outDir, entries);
    console.log(`Captured ${entries.length} button images on page ${page} from the web UI`);
  } else {
    throw new Error("--mode must be 'satellite' or 'screenshot'");
  }
}

async function cmdAnnotate(args) {
  const outDir = args.out ?? "output";
  if (!args.config) throw new Error("--config <path to .companionconfig> is required");

  const buttonMetas = await parseCompanionExport(args.config);
  const annotations = await loadAnnotations(outDir);
  mergePrefill(annotations, buttonMetas);
  await saveAnnotations(outDir, annotations);

  const pageTitles = await parsePageTitles(args.config);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "pages.json"), JSON.stringify(pageTitles, null, 2));

  console.log(`Merged prefill annotations for ${buttonMetas.length} buttons into ${outDir}/annotations.json`);
  console.log(`Wrote ${Object.keys(pageTitles).length} page titles to ${outDir}/pages.json`);
}

async function cmdBuild(args) {
  const outDir = args.out ?? "output";
  const result = await buildSite({ outDir });
  console.log(`Built site: ${result.pageCount} page(s), ${result.buttonCount} button image(s) -> ${result.siteDir}/index.html`);
}

async function cmdServe(args) {
  const outDir = args.out ?? "devices";
  const port = Number(args.port ?? 4321);
  await serve({ outDir, port });
}

async function cmdScrape(args) {
  if (!args.host) throw new Error("--host <ip or hostname> is required");
  await scrapeDevice({
    host: args.host,
    port: args.port ? Number(args.port) : undefined,
    device: args.device,
    devicesRoot: args.out ?? "devices",
  });
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const args = parseArgs(rest);

  switch (command) {
    case "capture":
      await cmdCapture(args);
      break;
    case "annotate":
      await cmdAnnotate(args);
      break;
    case "build":
      await cmdBuild(args);
      break;
    case "serve":
      await cmdServe(args);
      break;
    case "scrape":
      await cmdScrape(args);
      break;
    default:
      console.error("Usage: node src/cli.js <scrape|capture|annotate|build|serve> [--flags]");
      console.error("  scrape --host <ip> [--device <name>] [--port 8000] [--out devices]");
      console.error("    One-shot: pulls the config export, discovers every page, captures");
      console.error("    every button, and merges annotations for a single Companion instance.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
