// dpx_deckDoc live editor — vanilla JS, no build step, no framework.
// Device -> Pages -> Buttons tree: pick a device first, then a page.

const deviceNavEl = document.getElementById("device-nav");
const deckEl = document.getElementById("deck");
const panelEl = document.getElementById("side-panel");
const navEl = document.getElementById("page-nav");

let devices = [];
let currentDevice = null;
let manifest = [];
let annotations = {};
let pageTitles = {};
let currentPage = null;
let selectedBtn = null; // {page,row,col} currently in edit mode, or null

function imgUrl(page, row, col) {
  return `/images/${currentDevice}/${page}/${row}-${col}.png`;
}

async function loadDevices() {
  const res = await fetch("/api/devices");
  devices = await res.json();
}

async function loadDeviceData(slug) {
  const res = await fetch(`/api/data?device=${encodeURIComponent(slug)}`);
  const data = await res.json();
  manifest = data.manifest;
  annotations = data.annotations;
  pageTitles = data.pageTitles ?? {};
}

function renderDeviceNav() {
  deviceNavEl.innerHTML = "";
  for (const d of devices) {
    const btn = document.createElement("button");
    btn.className = d.slug === currentDevice ? "active" : "";
    btn.innerHTML = `<span class="device-name">${d.slug}</span><span class="device-meta">${d.pageCount} pages · ${d.buttonCount} buttons</span>`;
    btn.addEventListener("click", () => selectDevice(d.slug));
    deviceNavEl.appendChild(btn);
  }
}

async function selectDevice(slug) {
  currentDevice = slug;
  selectedBtn = null;
  await loadDeviceData(slug);
  const pages = pagesFromManifest();
  currentPage = pages[0] ?? null;
  renderDeviceNav();
  renderNav();
  renderDeck();
  renderPanelEmpty();
}

function pagesFromManifest() {
  return [...new Set(manifest.map((e) => e.page))].sort((a, b) => a - b);
}

function renderNav() {
  navEl.innerHTML = "";
  for (const p of pagesFromManifest()) {
    const entries = manifest.filter((e) => e.page === p);
    const rows = Math.max(...entries.map((e) => e.row)) + 1;
    const cols = Math.max(...entries.map((e) => e.col)) + 1;

    const btn = document.createElement("button");
    btn.className = p === currentPage ? "active" : "";

    const thumb = document.createElement("div");
    thumb.className = "nav-thumb";
    thumb.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    thumb.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    for (const e of entries) {
      const img = document.createElement("img");
      img.src = imgUrl(e.page, e.row, e.col);
      img.style.gridRow = e.row + 1;
      img.style.gridColumn = e.col + 1;
      thumb.appendChild(img);
    }

    const label = document.createElement("span");
    label.textContent = pageTitles[p] ? `${p} — ${pageTitles[p]}` : `Page ${p}`;

    btn.appendChild(thumb);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      currentPage = p;
      selectedBtn = null;
      renderNav();
      renderDeck();
      renderPanelEmpty();
    });
    navEl.appendChild(btn);
  }
}

function keyFor(page, row, col) {
  return `${page}/${row}/${col}`;
}

function renderDeck() {
  const entries = manifest.filter((e) => e.page === currentPage);
  if (!entries.length) {
    deckEl.innerHTML = "";
    return;
  }
  const rows = Math.max(...entries.map((e) => e.row)) + 1;
  const cols = Math.max(...entries.map((e) => e.col)) + 1;
  deckEl.style.gridTemplateColumns = `repeat(${cols}, 96px)`;
  deckEl.style.gridTemplateRows = `repeat(${rows}, 96px)`;
  deckEl.innerHTML = "";

  for (const e of entries) {
    const key = keyFor(e.page, e.row, e.col);
    const ann = annotations[key];
    const cell = document.createElement("div");
    cell.className = "btn";
    cell.style.gridRow = e.row + 1;
    cell.style.gridColumn = e.col + 1;
    if (ann?.notice) cell.classList.add("has-notice");
    if (ann && (ann.heading || ann.body || ann.notice || ann.note)) cell.classList.add("has-annotation");
    if (selectedBtn && selectedBtn.page === e.page && selectedBtn.row === e.row && selectedBtn.col === e.col) {
      cell.classList.add("selected");
    }

    const img = document.createElement("img");
    img.src = imgUrl(e.page, e.row, e.col);
    img.alt = `${e.row}/${e.col}`;
    cell.appendChild(img);

    cell.addEventListener("mouseenter", () => {
      if (!selectedBtn) renderPanelPreview(e, ann);
    });
    cell.addEventListener("mouseleave", () => {
      if (!selectedBtn) renderPanelEmpty();
    });
    cell.addEventListener("click", () => {
      selectedBtn = { page: e.page, row: e.row, col: e.col };
      renderDeck();
      renderPanelEdit(e, annotations[key]);
    });

    deckEl.appendChild(cell);
  }
}

function renderPanelEmpty() {
  panelEl.innerHTML = `<p class="empty-hint">Hover a button to preview its annotation.<br>Click a button to edit it.</p>`;
}

function renderPanelPreview(e, ann) {
  panelEl.innerHTML = `
    <div class="loc">Page ${e.page} — ${e.row}/${e.col}</div>
    ${ann?.heading ? `<div class="heading">${escapeHtml(ann.heading)}</div>` : ""}
    ${ann?.body ? `<div class="body-text">${escapeHtml(ann.body)}</div>` : ""}
    ${ann?.notice ? `<div class="notice">${escapeHtml(ann.notice)}</div>` : ""}
    ${ann?.note ? `<div class="note">${escapeHtml(ann.note)}</div>` : ""}
    ${ann?.command ? `<div class="command">${escapeHtml(ann.command)}</div>` : ""}
    ${!ann || (!ann.heading && !ann.body && !ann.notice && !ann.note && !ann.command) ? `<p class="empty-hint">No annotation yet — click to add one.</p>` : ""}
  `;
}

function renderPanelEdit(e, ann) {
  const a = ann ?? { heading: "", body: "", notice: "", note: "", command: "" };
  panelEl.innerHTML = `
    <div class="loc">Editing Page ${e.page} — ${e.row}/${e.col}</div>
    <form id="edit-form">
      <label for="f-heading">Heading</label>
      <input id="f-heading" name="heading" value="${escapeAttr(a.heading)}">
      <label for="f-body">Body — what this does, for humans</label>
      <textarea id="f-body" name="body" rows="3">${escapeHtml(a.body)}</textarea>
      <label for="f-notice">Notice</label>
      <input id="f-notice" name="notice" value="${escapeAttr(a.notice)}">
      <label for="f-note">Note</label>
      <input id="f-note" name="note" value="${escapeAttr(a.note)}">
      <label for="f-command">Command — raw connection/action (auto-filled)</label>
      <textarea id="f-command" name="command" rows="2">${escapeHtml(a.command)}</textarea>
      <div class="save-row">
        <button type="submit" class="save">Save</button>
        <button type="button" class="cancel" id="cancel-btn">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById("cancel-btn").addEventListener("click", () => {
    selectedBtn = null;
    renderDeck();
    renderPanelEmpty();
  });

  document.getElementById("edit-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const payload = {
      device: currentDevice,
      page: e.page,
      row: e.row,
      col: e.col,
      heading: fd.get("heading") ?? "",
      body: fd.get("body") ?? "",
      notice: fd.get("notice") ?? "",
      note: fd.get("note") ?? "",
      command: fd.get("command") ?? "",
    };
    const res = await fetch("/api/annotation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const saved = await res.json();
    annotations[keyFor(e.page, e.row, e.col)] = saved;
    selectedBtn = null;
    renderDeck();
    renderPanelEmpty();
  });
}

function escapeHtml(str) {
  return (str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

async function renderTopbar() {
  const res = await fetch("/api/meta");
  const meta = await res.json();
  const bar = document.getElementById("dpx-topbar");
  bar.innerHTML = `
    <img src="dubpixel_identicon.png" alt="dubpixel" height="18">
    <span class="dpx-version">v${meta.version}</span>
    <a href="${meta.githubUrl}" target="_blank" rel="noopener">GitHub</a>
    ${meta.branch ? `<span class="dpx-git">${meta.branch}${meta.sha ? ` @ ${meta.sha}` : ""}</span>` : ""}
  `;
}

async function init() {
  await Promise.all([loadDevices(), renderTopbar()]);
  if (!devices.length) {
    deviceNavEl.innerHTML = `<p class="empty-hint">No devices captured yet. Run: <code>node src/cli.js scrape --host &lt;ip&gt;</code></p>`;
    return;
  }
  await selectDevice(devices[0].slug);
}

init();
