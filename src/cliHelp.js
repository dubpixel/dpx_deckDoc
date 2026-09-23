// ================================================================================
// CLI HELP - per-subcommand --help/-h text
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/cliHelp.js
// Purpose: Centralizes the usage text shown by `node src/cli.js <cmd> --help`
//          (or `-h`) for every subcommand, plus the no-args top-level usage.
//          Split out of cli.js so it's easy to keep every subcommand's help
//          in sync in one place (issue #9: docs/flags were hard for a
//          beginner to parse without running the tool first).
// Dependencies: none
//
// ================================================================================

export const TOP_LEVEL_HELP = `dpx_deckDoc - auto-generated documentation for Bitfocus Companion setups

Usage: node src/cli.js <command> [--flags]

Commands:
  init      Guided setup: prompts for a Companion host + device name, then scrapes it
  demo      Seed a fabricated local demo device (no real Companion instance) and launch serve
  scrape    One-shot: pulls the config export, captures every page/button, merges prefill
  serve     Live editable local app for writing annotations
  build     Freeze one device into a dependency-free static handoff site
  capture   Lower-level: capture a single page (screenshot or satellite mode)
  annotate  Lower-level: merge prefill annotations from a .companionconfig export

Run "node src/cli.js <command> --help" for a command's flags and examples.
New here? Try "node src/cli.js demo" first — it needs no real Companion instance.`;

export const HELP = {
  init: `Usage: node src/cli.js init

Guided first-run setup. Prompts interactively for:
  - the Companion instance's host/IP (required, never guessed or defaulted)
  - a device name (optional; defaults to a sanitized version of the host)

Then runs the same scrape logic as "scrape" against what you entered, and
prints the exact "serve" command to run next.

Flags:
  --out <dir>   Devices root to scrape into (default: devices)
  --help, -h    Show this help`,

  demo: `Usage: node src/cli.js demo [--flags]

Seeds a small FABRICATED local device (hand-written placeholder button
art + sample annotations) — no network call, no real Companion instance,
ever — then launches "serve" automatically so you can see a working
editor within seconds of installing.

Flags:
  --device <name>   Demo device slug (default: demo)
  --out <dir>       Devices root to seed into (default: devices)
  --port <n>        Port for the auto-launched serve (default: 4321)
  --no-serve        Only seed the demo device; don't launch serve
  --help, -h        Show this help`,

  scrape: `Usage: node src/cli.js scrape --host <ip> [--flags]

One-shot: pulls the config export, discovers every real page, captures
every button's actual rendered bitmap, and merges prefill annotations for
a single Companion instance.

Flags:
  --host <ip>       Companion instance IP/hostname (required, never guessed)
  --port <n>        Companion web UI port (default: 8000)
  --device <name>   Device slug (default: sanitized version of --host)
  --out <dir>       Devices root to scrape into (default: devices)
  --help, -h        Show this help

Example:
  node src/cli.js scrape --host 10.0.0.5 --device foh-panel`,

  serve: `Usage: node src/cli.js serve [--flags]

Live editable local app for writing annotations (Heading/Body/Notice/Note/
Command) across every device under a devices root. Device switcher, page
nav with thumbnails, click-to-edit side panel, "+ New Device" scrapes from
the browser.

Flags:
  --out <dir>   Devices root to serve (default: devices)
  --port <n>    Port to listen on (default: 4321)
  --help, -h    Show this help`,

  build: `Usage: node src/cli.js build [--flags]

Freezes one device into a dependency-free static handoff site that opens
by double-clicking index.html — no server or build step required to view it.

Flags:
  --out <dir>   Path to the ONE device directory to build (not the devices
                root) — e.g. devices/foh-panel (default: output)
  --help, -h    Show this help`,

  capture: `Usage: node src/cli.js capture --mode <screenshot|satellite> --out <dir> [--flags]

Lower-level primitive: captures a single page. Prefer "scrape" for a whole
instance — this is for ad hoc single-page work.

Flags (screenshot mode):
  --mode screenshot   Required
  --url <tablet-url>  Required — e.g. http://10.0.0.5:8000/tablet.html?page=1
  --page <n>          Page number being captured (default: 1)
  --out <dir>         Output directory (default: output)

Flags (satellite mode, reference implementation only, not the primary pipeline):
  --mode satellite   Required
  --host <ip>        Required, never guessed
  --page <n>         Page number (default: 1)
  --rows <n>         Grid rows (default: 4)
  --cols <n>         Grid cols (default: 8)
  --out <dir>        Output directory (default: output)

  --help, -h    Show this help`,

  annotate: `Usage: node src/cli.js annotate --config <path> [--flags]

Lower-level primitive: parses a .companionconfig export and merges its
connection/action metadata into <out>/annotations.json as prefill, never
overwriting a hand-written entry. Prefer "scrape" for a whole instance.

Flags:
  --config <path>   Path to a .companionconfig export file (required)
  --out <dir>       Output directory (default: output)
  --help, -h        Show this help`,
};

/**
 * @param {string} command - a key of HELP, or anything else for the top-level usage
 */
export function printHelp(command) {
  console.log(HELP[command] ?? TOP_LEVEL_HELP);
}
