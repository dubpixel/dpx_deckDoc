# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
-

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
