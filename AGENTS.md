# dpx Agent Workflow & Documentation Standards - v1d6

This document provides operational directives for AI coding assistants (GitHub Copilot, Claude Code, Cursor, etc.) working on dubpixel projects. These rules ensure consistent workflow automation, code quality, and documentation maintenance across all repositories.

---

## PROJECT: dpx_deckDoc

**Status:** v0.8.0, public GitHub Pages manual + dummy-data demo live (2026-09-23)
**Branch:** `feature/pages-manual-and-demo`
**Version File:** `VERSION` (currently 0.8.0)
**Repo:** https://github.com/dubpixel/dpx_deckDoc (public)
**Pages:** https://dubpixel.github.io/dpx_deckDoc/ (manual) · https://dubpixel.github.io/dpx_deckDoc/demo/ (demo)

### Architecture (2-minute summary)

Auto-generated documentation tool for Bitfocus Companion control-surface setups. `scrape` points at one Companion instance and does the whole capture in one shot: pulls the config export, discovers every real page, captures every button's actual rendered bitmap from the web UI, and pre-fills structured annotations. Each Companion instance is a **device**; devices live side by side under `devices/<slug>/`, forming a device → pages → buttons tree. `serve` is a live editable local app for writing annotations (Heading/Body/Notice/Note/Command); `build` freezes one device into a dependency-free static handoff site. Node.js CLI, no build step; output is plain HTML/CSS/JS.

| Component | Tech/Location | Purpose | Notes |
|-----------|---------------|---------|-------|
| One-shot scrape | Node / `src/scrape.js` | Pulls the config export, discovers all pages, captures every button, merges prefill — the primary entry point | `node src/cli.js scrape --host <ip> [--device <name>]` |
| Web UI capture | Playwright / `src/capture/screenshot.js` | Extracts real rendered button bitmaps directly from Companion's tablet UI DOM | `captureManyPages` does one continuous scroll for a whole scrape (see Gotchas); `captureScreenshotPage` is the single-page convenience wrapper |
| Config parser | Node / `src/config/parseExport.js` | Parses a `.companionconfig` export (gzip JSON) into per-button connection/action metadata + page titles | Schema confirmed against a real export, not guessed |
| Annotation store | Node / `src/annotate/store.js` | Reads/writes `<device>/annotations.json`; structured fields (Heading/Body/Notice/Note/Command), never clobbers a hand-written entry | `command` holds raw prefill data; `body` is always left for a human write-up |
| Live editor | Node `http` / `src/serve.js` + `editor-template/` | Multi-device editable local app — device switcher (shows real host:port + last-scraped time, "×" to delete a device), page nav with thumbnails, click-to-edit side panel, "+ New Device" scrapes from the browser (no CLI needed), "Manage Pages" include/exclude checkboxes | `node src/cli.js serve --out devices` |
| Page selection | Node / `src/pageSelection.js` | Per-page include/exclude flags (`<device>/page-selection.json`) — excluded pages are hidden from the editor nav and skipped by `build` | Included by default; only explicit `false` excludes |
| Export from browser | `src/serve.js` `/api/build` + `/built/<device>/...` | Runs `buildSite()` server-side and serves the result back so the frozen static site can be opened without touching the CLI | "Export Site" button in the editor header |
| Label override | `annotations[key].labelOverride` | Replaces the captured on-image text with a fixed override, rendered as an overlay on the button in both the editor and static site | Never auto-filled; purely a manual annotation field |
| Regression tests | Node built-in `node:test` / `test/` | Covers the annotation store, config parser (schema-accurate fixture), manifest/page-selection helpers, `buildSite()`, and `serve.js`'s real HTTP routes | `npm test` — zero added dependencies. Capture itself is not unit-tested (browser/DOM-coupled); verify against a real instance |
| Site generator | Node / `src/site/build.js` + `site-template/` | Builds one device's frozen static handoff site | No bundler; plain `<script>` (not `type="module"` — fails under `file://`, see Gotchas) |
| Satellite capture (reference only) | Node (`net` sockets) / `src/capture/satellite.js` | Protocol-correct Satellite API client, not part of the primary pipeline | Dropped as unnecessary — see Key Decisions |
| Public manual | Jekyll (GitHub Pages) / `index.md` + `_config.yml` | The repo's public website root — beginner-friendly quickstart, CLI reference, annotation field reference, links to the demo | No local build step; GitHub Pages runs Jekyll itself off `_config.yml`'s `remote_theme` |
| Demo site | Node / `scripts/generate-demo-site.js` → `demo-src/device/` → `demo/` | Fabricates a small fake device (SVG placeholder buttons, no real Companion instance, no network) and runs it through the real `buildSite()` pipeline; output is committed static HTML under `/demo/` for Pages | Re-run `node scripts/generate-demo-site.js` after any `site-template/` or demo-content change; `demo/` is committed (not gitignored) since Pages serves it directly |
| Notion concept doc | Notion / dpx_labs → dpx_deckDoc | Original concept, viewing-mode ideas, TODOs | **Source of truth for product concept** |

### Agent Rules (for this repo)

**Before ANY code change:**
1. Work from `main`; create feature branch: `feature/brief-description`
2. Bump VERSION file per semantic versioning (AGENTS.md §1)
3. Create git commit for version bump, tag it: `git tag vX.Y.Z`

**While coding:**
- No build step anywhere: the CLI runs directly with `node`, no TS compile/bundle step; the generated viewer site is hand-authored HTML/CSS/JS, opened or served as-is
- Capture backends stay pluggable and interchangeable — both write to the same `output/images/` + `manifest.json` layout so `annotate`/`build` don't care which one ran
- Never run the Satellite API capture against a Companion host without an explicit, user-supplied `--host` — no default/guessed target, no auto-discovery
- Keep changes small, test before committing
- File header per AGENTS.md §3

**When done:**
- Update CHANGELOG.md with feature list
- Create PR per AGENTS.md §1 template
- Run the relevant CLI command(s) end-to-end against real output before calling a step done
- Run `npm test` before committing; add/update a regression test for any bug fixed or schema/route touched

### Critical Constraints

**MUST HAVE:**
- ✅ One-shot `scrape` captures a whole instance correctly (all pages, full grid, including blank slots)
- ✅ Annotation prefill from `.companionconfig` export that never overwrites a hand-edited entry
- ✅ Static handoff site (`build`) works by opening `index.html` directly — no server or build step required to view it
- ✅ Multiple Companion instances live side by side as separate devices under `devices/`

**DO NOT:**
- ❌ Auto-connect to any Companion instance without an explicit `--host`/URL from the user
- ❌ Add a frontend framework or bundler to the viewer site — plain HTML/CSS/JS only
- ❌ Overwrite a hand-written annotation with a config-export prefill

### Key Decisions

- **Satellite API capture dropped (2026-09-22):** Originally planned as the "clean" capture path, but testing showed it's unnecessary — Companion's `/int/export/full` export already gives annotation data, and the tablet web UI's DOM gives accurate *rendered* button bitmaps (the export's own `png64` field only covers 47/253 real buttons, and it's just a raw uploaded icon, not the actual rendered composite with text/color/state baked in — not a substitute for the real thing). The web UI capture also doesn't require enabling Companion's "Subscriptions" setting the way Satellite `ADD-SUB` does. `src/capture/satellite.js` is kept as a reference implementation (protocol-correct, tested against real instances) but is not part of the primary pipeline.
- **Web UI DOM extraction, not screenshotting:** `src/capture/screenshot.js` doesn't actually screenshot — it loads `tablet.html?page=N` and reads each `.button-control` element's `title="Button P/R/C"` attribute plus its inlined `background-image: url("data:image/png;base64,...")` CSS, extracting the exact rendered per-button bitmap directly from the DOM. No cropping guesswork, no dependency on viewport/zoom.
- **Pre-fill annotations from config export:** Companion's `.companionconfig` export already has connection/action names per button; hand-writing every annotation from scratch is unnecessary busywork.
- **No build step, vanilla output:** Matches dpx broadcast-tooling philosophy (see Development Philosophy below) — minimal, auditable, works offline, nothing to compile before viewing the generated docs on-site.

### Gotchas & Landmines

1. **The tablet UI is ONE continuous scroller across ALL pages — `?page=N` does not jump there.** Confirmed 2026-09-22 the hard way: every load starts at page 1, and you must scroll down through every page in between to reach page N. A capture loop that reloads `?page=N` per page and expects to land there will silently capture nothing (or the wrong page's leftover DOM) for everything past the first couple of pages.
2. **It's sliding-window virtualized, not append-only — don't judge "done scrolling" by button count.** The rendered `.button-control` COUNT stays roughly constant as you scroll (old rows unmount as new ones mount); it never grows toward some total, so "count stopped increasing" triggers a false-positive stop after 1-2 steps. The correct signal is the scroller's own `scrollTop + clientHeight >= scrollHeight`. Both of the above cost real debugging time when a first full scrape captured only pages 1-3 out of 99 — see `src/capture/screenshot.js`'s header comment for the full story.
3. **Because of #1, capturing many pages is a single continuous scroll pass, not N separate captures.** `captureManyPages()` loads once and scrolls through the whole instance in one pass, collecting every page's buttons as they pass by — this is also far faster than re-scrolling from the top per page (a 99-page instance takes ~20s total, not 99× that).
4. **HTTP REST API can't read config:** Companion's plain HTTP remote-control API (`/api/location/...`) can trigger/style buttons but cannot read button config or export images — capture goes through the web UI DOM instead.
5. **Config prefill must be non-destructive:** `store.js` must check for an existing hand-written annotation before writing a prefill — always merge, never blind-overwrite `<device>/annotations.json`.
6. **`<script type="module">` fails under `file://`** (CORS) — the static handoff site (`build`) uses a plain `<script>` tag, since `viewer.js` has no imports anyway.
7. **`.companionconfig` schema, confirmed against a real export** (Companion 4.3.4, export version 12, pulled from `/int/export/full`): gzip-compressed JSON; `pages[n].controls[row][col]` (nested by row then col, not a flat key); actions at `control.steps["0"].action_sets.down`, each `{type:"action", definitionId, connectionId, options}` — `definitionId` is the action name, not `action`/`actionId`; `data.instances[connectionId].label` gives the connection's display name. Non-`"button"` control types (`pageup`/`pagedown`/`pagenum`) are Companion's built-in page-nav controls, not configurable buttons.
8. **Satellite API `ADD-SUB` requires Companion >= ~4.3.0 AND an explicit "Subscriptions" setting enabled** — confirmed both gates independently (an older instance rejected the command entirely; a 4.3.4 instance understood it but replied `Subscriptions not enabled`). Moot now since Satellite capture was dropped from the primary pipeline (see Key Decisions), but kept as a protocol-correct reference in `src/capture/satellite.js`.
9. **The `[hidden]` attribute needs an explicit CSS override if the element also has a class-based `display` rule.** A modal styled `.modal-overlay { display: flex; ... }` stays visible even with `hidden` set on the element — the class selector and the browser's built-in `[hidden] { display: none }` UA rule have equal specificity, and the later-loaded stylesheet (yours) wins. Fix: `[hidden] { display: none !important; }` near the top of `editor.css`. Cost real time — both modals appeared stuck open on first load until this was added.
10. **The live editor used to hardcode `.png`/`image/png` for button images (`editor.js`'s `imgUrl()` and `serve.js`'s `/images/:device/...` route).** Never noticed before because real `scrape` captures are always PNG — the demo's SVG placeholders exposed it as broken images in the editor. Both now derive the real extension/content-type from the file itself. If a future capture backend writes a non-PNG format, this is already handled.
11. **Before screenshotting `serve` for public docs, confirm nothing else is already bound to port 4321.** A stale background `serve` process from an earlier task can still be listening, and a fresh `serve --out <dir>` call that fails to bind (port in use) leaves you silently screenshotting whatever the *old* process is serving — which may be a real captured device, not the fixture you intended. Check `lsof -i :4321` and kill anything already there first; verify `curl localhost:4321/api/devices` shows only the expected device(s) before capturing.

### Common Operations

**Scrape an entire Companion instance (the normal path):** `node src/cli.js scrape --host <ip> [--device <name>] [--out devices]` — one shot: pulls the export, discovers every page, captures every button, merges prefill.

**Author annotations live:** `node src/cli.js serve --out devices` → `http://localhost:4321`, device switcher + click-to-edit.

**Freeze one device to a static handoff site:** `node src/cli.js build --out devices/<slug>` → `devices/<slug>/site/index.html`.

**Lower-level primitives** (still useful for ad hoc single-page work): `capture --mode screenshot --url <tablet-url> --page N --out <dir>`, `annotate --config <export-file> --out <dir>`.

**Run the regression suite:** `npm test`.

**Regenerate the public demo site:** `node scripts/generate-demo-site.js` — rebuilds `demo-src/device/` (fake data) and `/demo/` (frozen static output) from scratch; run after any `site-template/` change so the published demo stays current.

**Known test instances:** `10.196.11.26` (Companion 4.2.5) and `127.0.0.1:8000` (Companion 4.3.4, same show config, local dev machine) are available for development/testing. Treat both as real dev targets unless told otherwise — do not assume it's safe to run destructive/state-changing commands against either beyond capture.

### Reference

See the Notion page `dpx_labs / dpx_deckDoc` for the original concept, viewing-mode ideas (tooltips vs. margin notes), and open TODOs.

**Closed:** [#6 — GitHub Pages manual](https://github.com/dubpixel/dpx_deckDoc/issues/6) and [#7 — demo site](https://github.com/dubpixel/dpx_deckDoc/issues/7), built together in v0.8.0. #7 shipped as option 1 from its own ticket (static frozen `build` output, dummy data, zero real Companion data) — option 2 (localStorage-backed fake editing) and option 3 (real hosted `serve`) remain possible future upgrades, not started.

**Open, scoped-but-not-built tickets:**
- [#9 — Improve first-run CLI ergonomics / install experience](https://github.com/dubpixel/dpx_deckDoc/issues/9): beginner feedback that install + CLI flags are hard to parse; ideas include a guided `init` command, per-subcommand `--help`, possible npm publish — not scoped to a specific approach yet

### Development Philosophy

This is broadcast infrastructure documentation tooling — reliability and simplicity trump features. Prefer vanilla JavaScript over frameworks for the generated site. Keep dependencies minimal and auditable (Playwright is the one exception, for screenshot capture). Never assume it's safe to write to a live Companion instance's control state — capture-only, read-only interactions with the target system.

---
## 0. Mid-Session Issue Triage (MANDATORY)
**Default: log it, don't fix it mid-session.**

- If something broken or wanted comes up, file a GitHub issue and move on
- Only fix immediately if you explicitly say *"fix this"* or *"fix it now"*
- Start of session: `gh issue list --repo <owner>/<repo>`
- End of session: `gh issue create --repo <owner>/<repo> --title "..." --body "..."`

The rationale: prevents mid-session context-switching that breaks working code.

## 1. Automatic Workflow (MANDATORY)

These actions are **required** and must happen automatically. **NEVER ask permission** for these workflow steps.

### Branching Strategy

**BEFORE starting ANY code changes:**

1. Create a new branch from the default branch (master/main)
2. Never work directly on default branch
3. Branch naming conventions:

| Type | Format | Example |
|------|--------|---------|
| New feature | `feature/brief-description` | `feature/mqtt-decoder` |
| Bug fix | `fix/issue-description` | `fix/telegraf-timeout` |
| Documentation | `docs/what-changed` | `docs/update-architecture` |
| Refactor | `refactor/component-name` | `refactor/docker-volumes` |

### Version Bumping

**BEFORE the first code change:**

Bump the version number according to semantic versioning:

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix, typo fix, documentation update | Patch (0.0.X) | 1.2.3 → 1.2.4 |
| New feature, new endpoint, new capability | Minor (0.X.0) | 1.2.3 → 1.3.0 |
| Breaking change, API removal, incompatible change | Major (X.0.0) | 1.2.3 → 2.0.0 |

#### Semantic Versioning Principles

**Format:** `MAJOR.MINOR.PATCH` (e.g., `2.4.7`)

- **MAJOR**: Incompatible API changes, breaking existing functionality
- **MINOR**: New functionality added in a backwards-compatible manner  
- **PATCH**: Backwards-compatible bug fixes, docs, typos

**Pre-1.0 versions (0.x.y):**
- Anything goes - breaking changes allowed in minor bumps
- Common for projects in initial development
- Move to 1.0.0 when API is stable and production-ready

**Pre-release versions:**
- Alpha: `1.0.0-alpha.1` (early testing, unstable)
- Beta: `1.0.0-beta.2` (feature-complete, testing for bugs)
- Release Candidate: `1.0.0-rc.1` (final testing before release)

#### Version Bumping Decision Tree

**When multiple changes occur, use the highest level:**
- Bug fix + new feature → Minor bump (not patch)
- New feature + breaking change → Major bump (not minor)

**Edge cases:**

| Scenario | Bump Type | Reasoning |
|----------|-----------|-----------|
| Internal refactor, no API change | Patch | No external impact |
| New optional parameter with default | Minor | Backwards-compatible addition |
| Changed parameter order | Major | Breaks existing calls |
| Deprecated feature (still works) | Minor | Deprecation warning added |
| Removed deprecated feature | Major | Functionality removed |
| Performance improvement | Patch | Implementation detail |
| New dependency added | Minor | Expands capabilities |
| Security fix | Patch | Even if behavior changes slightly |
| Database schema change | Major | Requires migration |
| Config file format change | Major | Breaking existing configs |

#### Version Bump Workflow

1. **Determine bump type** based on changes planned
2. **Update version number** in code/config files
3. **Create git commit**: `bump version to X.Y.Z`
4. **Tag the commit**: `git tag vX.Y.Z` (note the `v` prefix)
5. **Push with tags**: `git push && git push --tags`
6. **Update CHANGELOG** (if present) with version and changes
7. **Proceed with feature/fix implementation**

**Version commit should be standalone** - don't mix version bump with other changes.

#### Changelog Integration

If project has CHANGELOG.md, update it with version bump:

```markdown
## [1.2.0] - 2026-02-13

### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Breaking change description
```
**If no CHANGELOG.MD file exists:** Create one in the root of the project.

**Where to bump version:**
- Python: `__version__` in `__init__.py` or `pyproject.toml`
- Node.js: `version` field in `package.json`
- General: `VERSION` file or constant in main entry point
- Docker: Version tag in `docker-compose.yml` or `Dockerfile` labels

**If no version file exists:** Create one in an appropriate location for the project.

### Version File Standards & Location

To ensure consistent version identification across projects, follow these standards:

#### Python Projects

**Preferred location: `app/__init__.py` or `src/__init__.py`**

```python
"""Project description."""

__version__ = "1.0.0"
__author__ = "dubpixel"
```

**Alternative: `pyproject.toml` (for modern Python packaging)**

```toml
[project]
name = "project-name"
version = "1.0.0"
```

**Alternative: `VERSION` file in project root**

```
1.0.0
```

Then read it in your module:
```python
from pathlib import Path
__version__ = (Path(__file__).parent / "VERSION").read_text().strip()
```

#### Node.js/JavaScript Projects

**Location: `package.json`** (standard)

```json
{
  "name": "project-name",
  "version": "1.0.0",
  "description": "Project description"
}
```

#### Docker Projects

**Location: `docker-compose.yml` labels AND `Dockerfile`**

`docker-compose.yml`:
```yaml
services:
  app:
    build: .
    labels:
      - "org.opencontainers.image.version=1.0.0"
      - "org.opencontainers.image.created=${BUILD_DATE}"
```

`Dockerfile`:
```dockerfile
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.title="Project Name"
```

#### Bash Scripts/Utilities

**Location: Top of main script or separate `VERSION` file**

```bash
#!/bin/bash
VERSION="1.0.0"
SCRIPT_NAME="manage.sh"

# Or read from VERSION file:
# VERSION=$(cat VERSION)
```

#### Version Display (REQUIRED)

**Always provide a way to display the version:**

- Python CLI: `python -m myapp --version`
- Node.js: `npm run version` or built into CLI
- Docker: `docker inspect <image> | grep version`
- Bash: `./script.sh --version`

**Example implementations:**

```python
# In your main.py or CLI entry point
import argparse
from app import __version__

parser = argparse.ArgumentParser()
parser.add_argument('--version', action='version', version=f'%(prog)s {__version__}')
```

```bash
# In bash script
if [[ "$1" == "--version" ]] || [[ "$1" == "-v" ]]; then
    echo "$SCRIPT_NAME version $VERSION"
    exit 0
fi
```

#### Multi-Component Projects

For projects with multiple components (e.g., frontend + backend + Docker):

1. **Synchronized versioning**: All components share the same version
2. **Central `VERSION` file** in project root
3. **Scripts/tools read from central file**

Example structure:
```
project-root/
├── VERSION              # 1.0.0
├── backend/
│   └── __init__.py      # Reads ../VERSION
├── frontend/
│   └── package.json     # Reads ../VERSION via build script
└── docker-compose.yml   # Reads VERSION via envsubst or build args
```

### Pull Request Creation

**AFTER completing the task:**

Create a pull request with this format:

```markdown
## Changes
- [Brief list of what changed]
- [One item per significant change]

## Testing
- [How to verify the changes work]
- [Commands to run or steps to follow]

## User Prompt
[The original request from the user - verbatim]
```

**PR Title Format:** `[Component] Brief description`

Examples:
- `[MQTT] Add BLE decoder support`
- `[Docs] Consolidate architecture documentation`
- `[Telegraf] Fix enum processor deprecation`

**NEVER ask permission to create the PR - just do it.**

### Build Artifact Naming Convention

Non-`main` builds append the branch slug to the filename so artifacts are
self-identifying without opening the run log.

| Branch | Filename |
|--------|----------|
| `main` | `<name>-vX.Y.Z.<ext>` |
| anything else | `<name>-vX.Y.Z-<branch-slug>.<ext>` |

```bash
if [ "$BRANCH" = "main" ]; then
  OUT="myapp-v${VERSION}.ext"
else
  BRANCH_SLUG=$(echo "$BRANCH" | sed 's|/|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g')
  OUT="myapp-v${VERSION}-${BRANCH_SLUG}.ext"
fi
```


## 2. Progress Tracking for Multi-Step Work

When working on tasks that span **more than 3 files** OR **more than 30 minutes of work**:

### Checkpoint Progress

Provide a status update using this template:

```markdown
## Progress Checkpoint

✅ **Completed:**
- Item 1 description
- Item 2 description

⬜ **Remaining:**
- Item 3 description
- Item 4 description

→ **Next Action:** [Specific next step you will take]
```

### When to Checkpoint

- After completing a logical phase of work
- Before switching to a different component
- When encountering a blocker or decision point
- Every 3-5 file edits in large refactors

### Resuming from Checkpoint

When continuing work after a checkpoint:
1. Read the last checkpoint status
2. Start with the "Next Action" item
3. Update checkpoint when that phase completes

**Purpose:** Prevents agents from getting lost in complex multi-step tasks and provides visibility to the user.

---

## 3. File Header Standards

All code files must include a comprehensive header comment section:

```
# ================================================================================
# [FILE TYPE] - [FILE PURPOSE]
# ================================================================================
# you can maybe write some stuff here - tagline etc.
# ================================================================================
# PROJECT: [project_name]
# ================================================================================
#
# File: [filename]
# Purpose: [what this file does]
# Dependencies: [key dependencies if any]
#
# CHANGE LOG: (if needed but should really be in the changelog for the git)
# 
# 2026-03-06: Complete rewrite - Interactive wizard (v2.1.0)
#
# ================================================================================
```

### Header Guidelines

- Use consistent separator lines (80 characters of `=`)
- Adjust comment syntax for the language (`#` for Python/bash, `//` for JS/C++, etc.)


---

## 4. Documentation Standards

### Project Context Documentation

Project-specific architecture, decisions, and operational knowledge should live in the **PROJECT section at the top of this file**. This keeps rules and context unified in one scannable document.

**When to use a separate CONTEXT.md:**
Only create a separate `CONTEXT.md` if reference data becomes large enough to be noisy:
- Long IP/VLAN tables
- Full API response examples  
- Hardware pinout references
- Extensive data schemas

If you create CONTEXT.md for overflow, add a reference in the PROJECT section at the top: "See CONTEXT.md for full network topology."

### How to Document Project Context

**DO:**
- ✅ Keep it clean, factual, and scannable
- ✅ Update when architecture changes
- ✅ Add information when you learn important project details
- ✅ Use tables, code blocks, and clear headings
- ✅ Think: "What does the next agent need to know?"
- ✅ Write in present tense, authoritative voice

**DON'T:**
- ❌ Append conversation transcripts
- ❌ Include timestamps like "On Feb 12 we discussed..."
- ❌ Make it a session log or diary
- ❌ Duplicate content from README.md (link instead)
- ❌ Let it become verbose or messy

**Update frequency:** Whenever you make architectural changes or learn critical project information.

---

## 5. Core Principles


### No Modifications to Working Code

- Do not refactor, optimize, or "improve" code that is working unless explicitly requested
- Avoid drive-by refactors when implementing a feature
- If you see potential improvements, mention them but don't implement without approval

### Comprehensive Commenting

- Document all code with clear, meaningful comments
- Preserve existing comments unless they become obsolete
- Remove or update comments that are no longer accurate
- Document WHY, not just WHAT (the code shows what, comments explain why)

### Small, Incremental Changes

- Make one logical change per commit
- Break large tasks into smaller steps
- Test each change before moving to the next
- Make it easy to review and roll back if needed

### Stay Focused

- Complete the current task before suggesting next steps
- Answer only what is asked
- Don't anticipate or propose additional work unless requested

### Document Everything

- README.md must be updated and maintaned when appropriate as per these guidelines
- CONTEXT.md must be updated and maintaned when appropriate as per these guidelines
- a comprehensive CHANGELOG.md must be kept updated and maintaned when appropriate as per these guidelines
- you can maintain a small changelog in the header if you wish but main changelog should be in the MD

---

## 6. Documentation Standards

### Inline Documentation

- Maintain comprehensive inline documentation
- Update comments when code changes (keep them in sync)
- Document all function parameters and return values
- Include usage examples for complex functions
- Explain algorithms and business logic


### README Files

- Keep README.md current and accurate
- README is user-facing - focus on how to USE the project
- **Confirm all changes to README with the user before committing**
- README should not duplicate CONTEXT.md (different audiences)

### CHANGELOG.MD

- Keep CHANGELOG.md current and accurate
- CHANGELOG is user-facing - focus on changes, version numbers, dates and git hashes if needed
- **keep this automated in background**
- changelog could be retroactively updated to reflect git commit names if that adds clariy
- **any changes to existing changelog line items should be confirmed with user**

### Markdown Style

- Use consistent heading hierarchy (don't skip levels)
- Use tables for structured information
- Include code blocks with language tags
- Use relative links to other project files
- Keep line length reasonable (~80-100 chars for prose)

---

## 7. Code Quality Guidelines

### General Principles

- Write clear, readable code with meaningful names
- Follow established coding patterns within the project
- Implement proper error handling (don't use bare `except:` or `catch`)
- Write testable code with clear interfaces
- Maintain consistent formatting and style

### Language-Specific

Agents should infer and follow the conventions of the language they're working in:
- Python: Follow PEP 8
- JavaScript: Follow project's ESLint config if present
- Bash: Follow Google Shell Style Guide principles
- Other languages: Use community-standard style guides

### Testing

- Add tests alongside new logic when appropriate
- Use deterministic inputs for tests (inject time/randomness, don't read system state)
- Name tests by behavior (e.g., `test_early_finish_extends_break`)
- Include both positive and negative test cases
- if the process includes: using ssh into a remote server, or user input in any way. open a terminal first for the user so you both can read it. 

---

## 8. Change Management

### Commit Practices

- **Commit message format:** Short, plain English, lowercase verb
  - Examples: `add mqtt decoder`, `fix telegraf config`, `update documentation`
- Make one logical change per commit
- Commit functional units (don't commit broken code)

### Before Committing

- Verify the code works (run/test it)
- Update all relevant documentation
- Update file change logs
- Remove debug code and console.log/print statements
- Check that no credentials or secrets are included

### After Committing

- Push to the feature branch
- Create PR (as described in Section 1)
- Include verification steps in PR description

---

## 9. Collaboration Standards

### Respect Existing Architecture

- Understand existing architectural decisions before changing them
- Ask for clarification when requirements are ambiguous
- Suggest alternatives when appropriate, but don't insist
- Consider the impact of changes on the broader codebase

### Maintain Backwards Compatibility

- Don't break existing APIs unless explicitly requested
- Provide migration paths for breaking changes
- Document any compatibility changes in PR description

### Communication

- Explain the reasoning behind suggested changes
- Provide rollback information when making significant changes
- Be transparent about limitations or uncertainties
- Keep responses concise and focused

---

## 10. Configuration & Secrets

### Environment Variables

- Use `.env` files for local development
- Provide `.env.example` with all required variables (use placeholder values)
- **NEVER commit** `.env` files or actual credentials to git
- Document all environment variables in CONTEXT.md or README.md

### Sensitive Data

- Keep credentials in environment variables, not hardcoded
- Use service account files in standard locations (e.g., `~/.config/gcloud/`)
- Add sensitive files to `.gitignore` immediately
- If secrets are accidentally committed, notify the user immediately

---

## Summary: Agent Checklist

Before starting work:
- [ ] Create feature branch
- [ ] Bump version appropriately

While working:
- [ ] Follow file header standards
- [ ] Update change logs in modified files
- [ ] Keep changes small and focused
- [ ] Checkpoint progress if task is large
- [ ] Update PROJECT section if architecture changes

After completing work:
- [ ] Test/verify the changes
- [ ] Update relevant documentation
- [ ] Create PR with proper format
- [ ] No credentials committed

---

*These standards ensure consistent, high-quality AI assistance across all Dubpixel projects.*
