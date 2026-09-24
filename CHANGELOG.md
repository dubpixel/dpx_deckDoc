# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `backups/` (gitignored, local-only) — full snapshots of two real devices pulled before reprogramming, staged as source material for issue #14's demo rebuild

### Note
- Priority direction confirmed: fully GUI-driven experience wanted over CLI ergonomics — filed [#15](https://github.com/dubpixel/dpx_deckDoc/issues/15). Issue #9 / PR #12 (guided `init`, `--help`, `demo` command) is built, tested, and left open but deprioritized.

## [0.10.2] - 2026-09-24

### Fixed
- **Zoomed-out page thumbnails (editor nav strip, static/demo site index cards) cropped button images, chopping their sides.** The thumbnail grid containers forced a fixed `16 / 10` aspect ratio while the actual button grid's shape (e.g. 8 cols × 4 rows) rarely matches that, so cells ended up non-square and `object-fit: cover` cropped the (actually square) button images to fit. Fixed by making each thumbnail cell square (`aspect-ratio: 1 / 1` on the image) instead of forcing the whole container to an arbitrary shape — `editor.css`, `site-template/style.css`, `demo-template/style.css`.

## [0.10.1] - 2026-09-24

### Changed
- **The public manual is now a hand-built `index.html`, not bare Jekyll-theme markdown.** The old `index.md` rendered through the vestigial `remote_theme`/`jekyll-theme-minimal` config and looked generic — replaced with a real designed page matching the visual bar of dpx_deckDoc's sibling dubpixel project sites (dpx_tc002_frm, dpx_claudeDeck): dark panel layout, real CTAs, GitHub stat badges, quickstart/CLI/annotation-field reference tables, and the real editable-demo screenshots. `_config.yml` is now vestigial (kept, matching the same pattern those sibling repos use) — nothing on the site actually goes through Jekyll's theme anymore.

## [0.10.0] - 2026-09-24

### Changed
- **The public demo is rebuilt from a real captured device (91 pages, 2823 buttons) instead of a small hand-fabricated fixture — and is now EDITABLE.** Closes issue #14. User reviewed the source backup's content and confirmed it's fine to publish (no secrets, generic show-control page names/prefill data). Click any button to edit Heading/Body/Notice/Note/Label override; saved to that visitor's own `localStorage` only — never shared between visitors, never written back to this repo — with a "Reset Demo" button to clear it. This is option 2 from the original issue #7 design.
- `scripts/generate-demo-site.js` now sources `backups/8H_LOCAL_v3.5.1--10.196.191.1--2026-09-23/` (real images/manifest/pages/annotations, host/port scrubbed) instead of fabricating placeholder SVGs, and swaps in `demo-template/`'s editable viewer/CSS in place of `site-template/`'s intentionally read-only ones after running the normal `buildSite()` pipeline
- New `demo-template/` (viewer.js + style.css) — the public-demo-only editable UI; `site-template/` (the real static handoff-site viewer) is untouched and stays read-only by design

## [0.9.2] - 2026-09-23

### Fixed
- **The classic (pre-4.x) UI fix in v0.9.1 was still incomplete: it fixed the DOM-selector mismatch but not a second, deeper bug.** That UI's button bitmaps load in asynchronously over a WebSocket after the page renders (`networkidle` doesn't wait for this — a long-lived WebSocket is never "in flight"). Reading the grid immediately after load caught most buttons still showing a shared placeholder frame. Confirmed against the real `8H_FRANK_v3.0.0` capture: only 63 of 3168 images (2%) were actually unique, versus ~94% unique on a comparable device captured via the modern/scroll path. Capture now polls a cheap signature of every button's image until it stops changing before extracting (`waitForClassicGridToSettle`/`isGridStable`).
- **The existing local `8H_FRANK_v3.0.0` capture (and its `backups/` copy) predates this fix and still has the incomplete/placeholder content** — the show network is no longer reachable to re-scrape it. Re-run `scrape` against that instance next time it's reachable to get a correct capture; the fix itself is verified via a synthetic Playwright fixture that reproduces the same async-loading behavior (`test/screenshot.classicAsyncBitmaps.test.js`), since the real instance couldn't be re-tested live.

### Added
- `test/screenshot.classicAsyncBitmaps.test.js` — an intentional exception to "capture isn't unit-tested": drives the real `captureManyPages()` against a real Playwright browser and a local fixture server that reproduces the exact async-bitmap-swap behavior, proving the settle-wait actually works
- Unit tests for `isGridStable()`'s stability decision

## [0.9.1] - 2026-09-23

### Fixed
- **Capture silently returned zero buttons for every page against a pre-4.x Companion instance.** Found testing against a real Companion 3.0.0 rig: that generation's tablet UI uses a completely different DOM (`.bank img`, all buttons rendered flat with no scroll virtualization, `alt="Button N"` resetting per page, bitmaps often `image/bmp` not PNG) than the `.button-control` layout the capture code was built and confirmed against. `src/capture/screenshot.js` now detects which UI generation is loaded and uses the right extraction strategy for each; an unrecognized DOM now throws a clear error instead of silently capturing nothing. Captured images are written with their real extension instead of a hardcoded `.png`.
- Live editor's `/images/` route and `imgUrl()` are extension-aware for the new `.bmp` case (same fix pattern as the earlier SVG one in v0.8.0 — added `.bmp` to the MIME map)

### Added
- Regression tests for the new classic-grid chunking/extension logic (`test/screenshot.classicGrid.test.js`)

## [0.8.0] - 2026-09-23

### Added
- Public GitHub Pages manual (`index.md`) — beginner-friendly quickstart, plain-language CLI reference, annotation field reference, links to the demo ([#6](https://github.com/dubpixel/dpx_deckDoc/issues/6))
- Public demo site with fabricated dummy data (`scripts/generate-demo-site.js` → `demo-src/device/` → `/demo/`) — no real Companion instance or show data involved; runs through the real `buildSite()` pipeline, published as a static read-only site ([#7](https://github.com/dubpixel/dpx_deckDoc/issues/7), option 1 of that ticket's three design options)
- README links to the manual and demo in the header nav row
- README + manual now embed real screenshots of the live editor and static handoff site (captured against the dummy demo data, no real show data)

### Fixed
- Live editor (`serve`) hardcoded `.png` when requesting button images, and its `/images/:device/...` route hardcoded `Content-Type: image/png` regardless of the file's real extension — any captured image that isn't a PNG (e.g. the new demo's SVG placeholders) rendered as a broken image in the editor. Found while shooting the manual's screenshots. Both now derive the real extension/MIME from the file.

### Note
- Filed [#9](https://github.com/dubpixel/dpx_deckDoc/issues/9) for improving first-run CLI ergonomics/install experience, per direct feedback that the docs are hard for a beginner to parse — scoped, not built, this pass

## [0.7.1] - 2026-09-23

### Changed
- Repository made public: https://github.com/dubpixel/dpx_deckDoc (checked for committed secrets first — none found)

### Added
- Scoped tickets for the two remaining pre-launch pieces: [#6](https://github.com/dubpixel/dpx_deckDoc/issues/6) GitHub Pages manual (repo website), [#7](https://github.com/dubpixel/dpx_deckDoc/issues/7) interactive dummy-data demo site — neither built yet, both scoped with explicit design options

## [0.7.0] - 2026-09-23

### Added
- `device.json` per device (host, port, scrapedAt) written by `scrape` — the device switcher now shows the real host:port and last-scraped time instead of just the slug name
- Delete a device from the live editor — "×" on each device card, confirmed via `window.confirm()`, backed by `DELETE /api/devices/:slug`
- Project directories renamed from `dpx_companionCompanion` to `dpx_deckDoc` to match the actual product name used everywhere else

## [0.6.0] - 2026-09-22

### Added
- Regression test suite (`npm test`, Node's built-in `node:test`, zero added dependencies): `test/annotate.store.test.js`, `test/pageSelection.test.js`, `test/manifest.test.js`, `test/parseExport.test.js` (schema-accurate fixture — the exact shape that broke twice during development), `test/site.build.test.js`, `test/serve.test.js` (real HTTP routes against a live server), `test/meta.test.js`. 43 tests, all passing.

### Changed
- `AGENTS.md` "While coding" rule now requires `npm test` before committing

## [0.5.0] - 2026-09-22

### Added
- "Export Site" button in the editor — runs `build` server-side and serves the frozen static site back at `/built/<device>/index.html`, no CLI needed
- Label override field: replaces the button's captured on-image text with a fixed override, shown as an overlay on the button in both the editor and static site

## [0.4.0] - 2026-09-22

### Added
- "+ New Device" in the live editor — scrapes a Companion instance straight from the browser (host/port/device form, streamed progress), no CLI needed
- "Manage Pages" — per-page include/exclude checkboxes; excluded pages are hidden from the editor nav and skipped by `build` (`<device>/page-selection.json`)
- Page nav row no longer wraps into a multi-row block for large instances — stays one horizontally-scrollable row

### Fixed
- Both modals (`New Device`, `Manage Pages`) appeared stuck open on load — `.modal-overlay { display: flex }` was overriding the `hidden` attribute (equal CSS specificity, later stylesheet wins). Added an explicit `[hidden] { display: none !important; }` rule.

## [0.3.0] - 2026-09-22

### Added
- One-shot `scrape` command (`node src/cli.js scrape --host <ip>`) — pulls the config export, discovers every real page, captures every button, and merges prefill in a single run
- Multi-device support: each Companion instance becomes a device under `devices/<slug>/`; live editor (`serve`) gained a device switcher (device → pages → buttons tree)
- UI scaled up across the board (base font 17px, button tiles 96px) — was unreadably small at 100% browser zoom
- GitHub repo created (`dubpixel/dpx_deckDoc`)

### Fixed
- **Major capture bug**: a full scrape previously captured only the first 2-3 pages and silently 0 buttons for everything else. Root cause, found and fixed: (1) Companion's tablet UI is one continuous scroller across all pages — `?page=N` doesn't jump there, every load starts at page 1; (2) it's sliding-window virtualized (rendered button count stays roughly constant while scrolling), so watching button count for "reached the bottom" falsely converges after 1-2 steps. Capture now does one continuous scroll pass per scrape, judged against real `scrollTop`/`scrollHeight`, not button counts — verified against all 99 pages of a real instance (3,168 buttons, full grids including blank slots)
- Static handoff site's grid now preserves the full physical button grid (including blank slots) instead of shrinking to only the buttons that happened to capture

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
