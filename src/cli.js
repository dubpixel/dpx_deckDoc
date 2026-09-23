#!/usr/bin/env node
// ================================================================================
// CLI - dpx_deckDoc entry point
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/cli.js
// Purpose: `init`, `demo`, `scrape`, `capture`, `annotate`, `build`, `serve`
//          subcommands tying the capture backends, config parser, annotation
//          store, and site generator together. No build step — run directly
//          with `node src/cli.js`.
//
//          `init` and `demo` (added for issue #9, first-run ergonomics):
//          `init` is a guided, interactive version of `scrape` (prompts for
//          host/device instead of requiring flags up front); `demo` seeds a
//          fabricated local device (no network, no real Companion instance)
//          and launches `serve` so a newcomer sees a working UI immediately.
//          Every subcommand now also answers `--help`/`-h`, and a missing
//          required flag prints a one-line friendly message instead of an
//          uncaught exception.
// Dependencies: playwright (screenshot mode only)
//
// CHANGE LOG:
// 2026-09-23: Added init/demo subcommands, per-subcommand --help/-h, and
//             friendly required-flag validation (issue #9, v0.9.0).
//
// ================================================================================

import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { captureSatellitePage } from "./capture/satellite.js";
import { captureScreenshotPage } from "./capture/screenshot.js";
import { parseCompanionExport, parsePageTitles } from "./config/parseExport.js";
import { loadAnnotations, saveAnnotations, mergePrefill } from "./annotate/store.js";
import { buildSite } from "./site/build.js";
import { serve } from "./serve.js";
import { appendManifest } from "./manifest.js";
import { scrapeDevice } from "./scrape.js";
import { seedDemoDevice } from "./demoDevice.js";
import { parseArgs, requireFlag, stringFlag, CliUsageError } from "./cliArgs.js";
import { printHelp } from "./cliHelp.js";

async function cmdCapture(args) {
  if (args.help) return printHelp("capture");
  const outDir = stringFlag(args, "out", "output");
  const page = Number(args.page ?? 1);

  if (args.mode === "satellite") {
    const host = requireFlag(args, "host", { command: "capture --mode satellite", example: "10.0.0.5" });
    const rows = Number(args.rows ?? 4);
    const cols = Number(args.cols ?? 8);
    const imgDir = path.join(outDir, "images", String(page));
    const result = await captureSatellitePage({
      host,
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
    const url = requireFlag(args, "url", { command: "capture --mode screenshot", example: "http://10.0.0.5:8000/tablet.html?page=1" });
    const imgDir = path.join(outDir, "images", String(page));
    const result = await captureScreenshotPage({
      url,
      outDir: imgDir,
      page,
    });
    const entries = result.buttons.map((b) => ({ page, row: b.row, col: b.col, image: b.path }));
    await appendManifest(outDir, entries);
    console.log(`Captured ${entries.length} button images on page ${page} from the web UI`);
  } else {
    throw new CliUsageError("capture requires --mode <screenshot|satellite>. Try: node src/cli.js capture --mode screenshot --url <tablet-url>");
  }
}

async function cmdAnnotate(args) {
  if (args.help) return printHelp("annotate");
  const outDir = stringFlag(args, "out", "output");
  const config = requireFlag(args, "config", { command: "annotate", example: "/path/to/export.companionconfig" });

  const buttonMetas = await parseCompanionExport(config);
  const annotations = await loadAnnotations(outDir);
  mergePrefill(annotations, buttonMetas);
  await saveAnnotations(outDir, annotations);

  const pageTitles = await parsePageTitles(config);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "pages.json"), JSON.stringify(pageTitles, null, 2));

  console.log(`Merged prefill annotations for ${buttonMetas.length} buttons into ${outDir}/annotations.json`);
  console.log(`Wrote ${Object.keys(pageTitles).length} page titles to ${outDir}/pages.json`);
}

async function cmdBuild(args) {
  if (args.help) return printHelp("build");
  const outDir = stringFlag(args, "out", "output");
  const result = await buildSite({ outDir });
  console.log(`Built site: ${result.pageCount} page(s), ${result.buttonCount} button image(s) -> ${result.siteDir}/index.html`);
}

async function cmdServe(args) {
  if (args.help) return printHelp("serve");
  const outDir = stringFlag(args, "out", "devices");
  const port = Number(args.port ?? 4321);
  await serve({ outDir, port });
}

async function cmdScrape(args) {
  if (args.help) return printHelp("scrape");
  const host = requireFlag(args, "host", { command: "scrape", example: "10.0.0.5" });
  await scrapeDevice({
    host,
    port: args.port ? Number(args.port) : undefined,
    device: stringFlag(args, "device", undefined),
    devicesRoot: stringFlag(args, "out", "devices"),
  });
}

/**
 * Guided setup: prompts for the Companion host + device name instead of
 * requiring flags to be known up front, runs the same scrapeDevice() the
 * `scrape` subcommand uses, then prints exactly what to run next.
 */
async function cmdInit(args) {
  if (args.help) return printHelp("init");
  const devicesRoot = stringFlag(args, "out", "devices");

  const rl = readline.createInterface({ input: processStdin, output: processStdout });
  try {
    console.log("dpx_deckDoc guided setup — scrapes one Companion instance into a device.\n");

    let host = "";
    while (!host) {
      host = (await rl.question("Companion instance host/IP (e.g. 10.0.0.5): ")).trim();
      if (!host) console.log("  A host is required — dpx_deckDoc never guesses or auto-discovers one.");
    }

    const portRaw = (await rl.question("Companion web UI port [8000]: ")).trim();
    const port = portRaw ? Number(portRaw) : undefined;

    const deviceRaw = (await rl.question("Device name [derived from host]: ")).trim();
    const device = deviceRaw || undefined;

    rl.close();

    console.log("");
    const result = await scrapeDevice({ host, port, device, devicesRoot });

    console.log("");
    console.log("Done! Next, start the live editor:");
    console.log(`  node src/cli.js serve --out ${devicesRoot}`);
    console.log(`Then open http://localhost:4321 and pick "${result.device}".`);
  } finally {
    rl.close();
  }
}

/**
 * "Try it locally" — seeds a fabricated demo device (no network, no real
 * Companion instance) and launches serve automatically, per issue #9.
 */
async function cmdDemo(args) {
  if (args.help) return printHelp("demo");
  const devicesRoot = stringFlag(args, "out", "devices");
  const deviceSlug = stringFlag(args, "device", "demo");
  const port = Number(args.port ?? 4321);

  console.log("Seeding a fabricated demo device (no real Companion instance, no network)...");
  const result = await seedDemoDevice({ devicesRoot, deviceSlug });
  console.log(`Demo device ready: ${result.pageCount} pages, ${result.buttonCount} buttons -> ${result.outDir}`);

  if (args["no-serve"]) {
    console.log(`Run "node src/cli.js serve --out ${devicesRoot}" to view it.`);
    return;
  }

  console.log("");
  await serve({ outDir: devicesRoot, port });
  console.log(`Open http://localhost:${port} and pick "${deviceSlug}" to explore the demo.`);
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
    case "init":
      await cmdInit(args);
      break;
    case "demo":
    case "try":
      await cmdDemo(args);
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      if (command === undefined) process.exitCode = 1;
      break;
    default:
      console.error(`Unknown command: "${command}"\n`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  // Friendly, one-line, actionable message — never a raw stack trace, even
  // for a plain "you forgot a flag" CliUsageError (issue #9).
  console.error(err.message);
  process.exitCode = 1;
});
