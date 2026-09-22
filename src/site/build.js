// ================================================================================
// SITE GENERATOR - builds the static viewer site
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/site/build.js
// Purpose: Reads manifest.json (captured button images) + annotations.json
//          and emits a static, no-build-step, no-server handoff site into
//          output/site/. This is the distribution artifact — `serve.js` is
//          the live editable version used while authoring annotations.
// Dependencies: none
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMeta } from "../meta.js";
import { loadPageSelection, isIncluded } from "../pageSelection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "..", "..", "site-template");

/**
 * @param {object} opts
 * @param {string} opts.outDir - the capture output dir containing manifest.json + annotations.json
 */
export async function buildSite({ outDir }) {
  const manifest = JSON.parse(await fs.readFile(path.join(outDir, "manifest.json"), "utf8"));
  let annotations = {};
  try {
    annotations = JSON.parse(await fs.readFile(path.join(outDir, "annotations.json"), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  let pageTitles = {};
  try {
    pageTitles = JSON.parse(await fs.readFile(path.join(outDir, "pages.json"), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const pageSelection = await loadPageSelection(outDir);

  const siteDir = path.join(outDir, "site");
  await fs.mkdir(path.join(siteDir, "images"), { recursive: true });

  const pages = new Map();
  for (const entry of manifest) {
    if (!isIncluded(pageSelection, entry.page)) continue;
    const destName = `${entry.page}-${entry.row}-${entry.col}${path.extname(entry.image)}`;
    await fs.copyFile(entry.image, path.join(siteDir, "images", destName));
    const key = `${entry.page}/${entry.row}/${entry.col}`;
    if (!pages.has(entry.page)) pages.set(entry.page, []);
    pages.get(entry.page).push({
      row: entry.row,
      col: entry.col,
      src: `images/${destName}`,
      ann: annotations[key] ?? null,
    });
  }

  await fs.copyFile(path.join(TEMPLATE_DIR, "style.css"), path.join(siteDir, "style.css"));
  await fs.copyFile(path.join(TEMPLATE_DIR, "viewer.js"), path.join(siteDir, "viewer.js"));
  await fs.copyFile(path.join(TEMPLATE_DIR, "dubpixel_identicon.png"), path.join(siteDir, "dubpixel_identicon.png"));

  const meta = getMeta();

  const pageCards = [...pages.entries()]
    .sort(([a], [b]) => a - b)
    .map(([p, buttons]) => {
      const rows = Math.max(...buttons.map((b) => b.row)) + 1;
      const cols = Math.max(...buttons.map((b) => b.col)) + 1;
      const title = pageTitles[p] ?? `Page ${p}`;
      const thumbHtml = buttons
        .map((b) => `<div class="thumb-btn" style="grid-row:${b.row + 1};grid-column:${b.col + 1}"><img src="${b.src}" alt=""></div>`)
        .join("");
      return `
        <a class="page-card" href="page-${p}.html">
          <div class="thumb-deck" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${thumbHtml}</div>
          <div class="page-card-label">Page ${p} — ${escapeAttr(title)}</div>
        </a>`;
    })
    .join("\n");

  await fs.writeFile(
    path.join(siteDir, "index.html"),
    renderShell(`<h1>dpx_deckDoc</h1><div class="page-grid">${pageCards}</div>`, meta)
  );

  for (const [page, buttons] of pages) {
    const rows = Math.max(...buttons.map((b) => b.row)) + 1;
    const cols = Math.max(...buttons.map((b) => b.col)) + 1;

    const buttonsHtml = buttons
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((b) => {
        const a = b.ann ?? {};
        const dataAttrs = [
          a.heading ? `data-heading="${escapeAttr(a.heading)}"` : "",
          a.body ? `data-body="${escapeAttr(a.body)}"` : "",
          a.notice ? `data-notice="${escapeAttr(a.notice)}"` : "",
          a.note ? `data-note="${escapeAttr(a.note)}"` : "",
          a.command ? `data-command="${escapeAttr(a.command)}"` : "",
        ].join(" ");
        const labelOverlay = a.labelOverride
          ? `<div class="label-override">${escapeAttr(a.labelOverride)}</div>`
          : "";
        return `
        <div class="btn" style="grid-row:${b.row + 1};grid-column:${b.col + 1}" data-loc="${b.row}/${b.col}" ${dataAttrs}>
          <img src="${b.src}" alt="button ${b.row}/${b.col}">
          ${labelOverlay}
        </div>`;
      })
      .join("\n");

    await fs.writeFile(
      path.join(siteDir, `page-${page}.html`),
      renderShell(`
        <a href="index.html">&larr; all pages</a>
        <h1>Page ${page} — ${pageTitles[page] ?? "untitled"}</h1>
        <div class="frame">
          <div class="side-panel" id="side-panel">
            <p class="empty-hint">Hover a button to see its annotation.</p>
          </div>
          <div class="deck-wrap">
            <div class="deck" id="deck" style="grid-template-columns:repeat(${cols},96px);grid-template-rows:repeat(${rows},96px)">${buttonsHtml}</div>
          </div>
        </div>
      `, meta)
    );
  }

  const buttonCount = [...pages.values()].reduce((n, buttons) => n + buttons.length, 0);
  return { pageCount: pages.size, buttonCount, siteDir };
}

function renderShell(bodyHtml, meta) {
  const gitLine = meta.branch ? `${meta.branch}${meta.sha ? ` @ ${meta.sha}` : ""}` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dpx_deckDoc</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="dpx-topbar">
  <img src="dubpixel_identicon.png" alt="dubpixel" height="18">
  <span class="dpx-version">v${meta.version}</span>
  <a href="${meta.githubUrl}" target="_blank" rel="noopener">GitHub</a>
  ${gitLine ? `<span class="dpx-git">${gitLine}</span>` : ""}
</div>
<main>
${bodyHtml}
</main>
<script src="viewer.js"></script>
</body>
</html>
`;
}

function escapeAttr(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
