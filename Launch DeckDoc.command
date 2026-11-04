#!/bin/bash
# ================================================================================
# LAUNCHER - double-click to start dpx_deckDoc (macOS)
# ================================================================================
# No terminal knowledge needed: double-click this file in Finder.
# ================================================================================
# PROJECT: dpx_deckDoc
# ================================================================================
#
# File: Launch DeckDoc.command
# Purpose: Starts the live editor (`serve`) and opens it in the default browser.
#          Does first-run setup (npm install + Playwright's browser) itself, and
#          reuses an already-running editor instead of starting a second one.
#          Closing the Terminal window this opens stops the editor.
# Dependencies: Node.js 18+ (the only thing that must be installed by hand)
# Env:     DECKDOC_PORT (default 4321), DECKDOC_OUT (default ./devices)
#
# ================================================================================

# Finder launches this with the folder you double-clicked from as cwd only
# sometimes — always anchor to the script's own folder so devices/ is found.
cd "$(dirname "$0")" || exit 1

PORT="${DECKDOC_PORT:-4321}"
OUT="${DECKDOC_OUT:-devices}"
URL="http://localhost:${PORT}"

# Native macOS dialog so a non-terminal user sees problems, not a vanishing window.
alert() {
  osascript -e "display dialog \"$1\" with title \"dpx_deckDoc\" buttons {\"OK\"} default button \"OK\" with icon caution" >/dev/null 2>&1
  echo "$1"
}

# Double-click shells don't always inherit Homebrew's PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  alert "Node.js is not installed. The download page will open — install it, then double-click this launcher again."
  open "https://nodejs.org/en/download"
  exit 1
fi

# Already running (e.g. from an earlier double-click)? Just open it.
if curl -s --max-time 2 "${URL}/api/meta" >/dev/null 2>&1; then
  echo "dpx_deckDoc is already running — opening ${URL}"
  open "$URL"
  exit 0
fi

# Port taken by something that is NOT our editor: say so rather than fail oddly.
if lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  alert "Port ${PORT} is in use by another program. Quit it, or set DECKDOC_PORT to a different port."
  exit 1
fi

# First-run setup. The marker lives in node_modules (gitignored) so deleting
# node_modules naturally re-triggers setup.
if [ ! -d node_modules/playwright ]; then
  echo "First run: installing dependencies (one time, needs internet)..."
  npm install || { alert "Setup failed while installing dependencies. See the Terminal window for details."; exit 1; }
fi
if [ ! -f node_modules/.deckdoc-browser-ok ]; then
  echo "First run: downloading the capture browser (one time, ~100 MB)..."
  npx playwright install chromium || { alert "Setup failed while downloading the capture browser. See the Terminal window for details."; exit 1; }
  touch node_modules/.deckdoc-browser-ok
fi

# Open the browser once the server answers (it starts in the foreground below).
(
  for _ in $(seq 1 40); do
    if curl -s --max-time 1 "${URL}/api/meta" >/dev/null 2>&1; then
      open "$URL"
      exit 0
    fi
    sleep 0.25
  done
) &

echo "Starting dpx_deckDoc at ${URL}  (close this window to stop it)"
exec node src/cli.js serve --out "$OUT" --port "$PORT"
