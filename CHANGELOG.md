# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
-

## [0.2.0] - 2026-09-22

### Added
- Real per-button web UI capture (`src/capture/screenshot.js`) reading rendered bitmaps directly out of Companion's tablet UI DOM — replaces the whole-page screenshot approach entirely
- Virtualization-safe capture: scrolls through Companion's tablet view and merges results, since it lazily renders rows in a continuous scroller (a page previously silently lost buttons below the fold)
- `.companionconfig` schema confirmed against a real export (gzip-compressed JSON, `pages[n].controls[row][col]`, `instances[id].label`) — parser rewritten to match
- Structured annotation fields: Heading, Body (human-written), Notice (styled red), Note (styled italic), Command (raw connection/action data, kept separate from Body)
- Every captured button — including built-in page-nav controls — gets an honest, software-derived Command field; nothing fabricated
- Live editable local app: `node src/cli.js serve` — hover/click to edit annotations, saves straight to `annotations.json`, no rebuild needed
- Static handoff site (`build`) redesigned: centered deck locked to the real button grid (including blank slots), side-panel annotation preview on hover, real page titles + real thumbnails on the index
- Standard dpx topbar (logo, version, GitHub link, branch @ commit) on both the live editor and the static site (`src/meta.js`)
- GitHub repo created (`dubpixel/dpx_deckDoc`, private) and pushed

### Fixed
- Static site's `<script type="module">` silently failed under `file://` (CORS) — switched to a plain script, since it has no imports
- Page grid previously rendered buttons via `auto-fill` flow instead of real row/col position

### Removed
- Satellite API dropped from the primary pipeline (kept as a reference implementation) — unnecessary once web UI capture + config export covered the same ground without needing Companion's Satellite "Subscriptions" setting enabled

## [0.1.0] - 2026-09-22

### Added
- Initial project scaffold: `AGENTS.md` PROJECT section documents the dpx_deckDoc concept
- Repo bootstrap (git init, VERSION file)
- `src/cli.js` with `capture`/`annotate`/`build` subcommands
- Satellite API capture backend (`src/capture/satellite.js`) — read-only `ADD-SUB` subscription, no device registration
- Screenshot capture backend (`src/capture/screenshot.js`, Playwright) — verified end-to-end against the dev Companion instance
- `.companionconfig` export parser for annotation prefill (`src/config/parseExport.js`) — schema unverified, see AGENTS.md gotcha #5
- Annotation store with non-destructive prefill merge (`src/annotate/store.js`)
- Static site generator with tooltip / margin-note viewing modes (`src/site/build.js`, `site-template/`)

### Known issues
- Satellite API capture requires Companion >= ~4.3.0; the dev instance (10.196.11.26) runs 4.2.5 and rejects `ADD-SUB`
- Screenshot capture produces one image per page, but the site generator assumes one image per button — not yet reconciled (see AGENTS.md gotcha #4)
