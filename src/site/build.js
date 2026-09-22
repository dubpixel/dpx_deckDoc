// ================================================================================
// SITE GENERATOR - builds the static viewer site
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/site/build.js
// Purpose: Reads manifest.json (captured button images) + annotations.json
//          and emits a static, no-build-step HTML site into output/site/.
// Dependencies: none
//
// ================================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  const siteDir = path.join(outDir, "site");
  await fs.mkdir(path.join(siteDir, "images"), { recursive: true });

  // copy captured images into the site's own images/ dir
  const pages = new Map();
  for (const entry of manifest) {
    const destName = `${entry.page}-${entry.row}-${entry.col}${path.extname(entry.image)}`;
    await fs.copyFile(entry.image, path.join(siteDir, "images", destName));
    const key = `${entry.page}/${entry.row}/${entry.col}`;
    if (!pages.has(entry.page)) pages.set(entry.page, []);
    pages.get(entry.page).push({
      row: entry.row,
      col: entry.col,
      src: `images/${destName}`,
      text: annotations[key]?.text ?? "",
    });
  }

  await fs.copyFile(path.join(TEMPLATE_DIR, "style.css"), path.join(siteDir, "style.css"));
  await fs.copyFile(path.join(TEMPLATE_DIR, "viewer.js"), path.join(siteDir, "viewer.js"));

  const pageLinks = [...pages.keys()]
    .sort((a, b) => a - b)
    .map((p) => `<li><a href="page-${p}.html">Page ${p}</a></li>`)
    .join("\n");

  await fs.writeFile(
    path.join(siteDir, "index.html"),
    renderShell(`<h1>dpx_deckDoc</h1><ul class="page-list">${pageLinks}</ul>`)
  );

  for (const [page, buttons] of pages) {
    const buttonsHtml = buttons
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map(
        (b) => `
        <div class="button" data-row="${b.row}" data-col="${b.col}">
          <img src="${b.src}" alt="button ${b.row}/${b.col}">
          <div class="tooltip">${escapeHtml(b.text)}</div>
          <div class="margin-note">${escapeHtml(b.text)}</div>
        </div>`
      )
      .join("\n");

    await fs.writeFile(
      path.join(siteDir, `page-${page}.html`),
      renderShell(`
        <a href="index.html">&larr; all pages</a>
        <h1>Page ${page}</h1>
        <div class="mode-toggle">
          <button data-mode="tooltip" class="active">Tooltips</button>
          <button data-mode="margin">Margin notes</button>
        </div>
        <div class="grid" id="grid">${buttonsHtml}</div>
      `)
    );
  }

  return { pageCount: pages.size, buttonCount: manifest.length, siteDir };
}

function renderShell(bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dpx_deckDoc</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
${bodyHtml}
<script type="module" src="viewer.js"></script>
</body>
</html>
`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
