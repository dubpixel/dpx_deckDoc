// dpx_deckDoc live editor — vanilla JS, no build step, no framework.
// Device -> Pages -> Buttons tree: pick a device first, then a page.

const deviceNavEl = document.getElementById("device-nav");
const deckEl = document.getElementById("deck");
const panelEl = document.getElementById("side-panel");
const navEl = document.getElementById("page-nav");
const manageBtn = document.getElementById("manage-pages-btn");
const newDeviceBtn = document.getElementById("new-device-btn");

let devices = [];
let currentDevice = null;
let manifest = [];
let annotations = {};
let pageTitles = {};
let pageSelection = {};
let currentPage = null;
let selectedBtn = null; // {page,row,col} currently in edit mode, or null

function isIncluded(page) {
  return pageSelection[String(page)] !== false;
}

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
  pageSelection = data.pageSelection ?? {};
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
  const pages = pagesFromManifest().filter(isIncluded);
  currentPage = pages[0] ?? pagesFromManifest()[0] ?? null;
  manageBtn.hidden = pagesFromManifest().length === 0;
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
  for (const p of pagesFromManifest().filter(isIncluded)) {
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

// ---- Manage Pages modal ----

const managePagesModal = document.getElementById("manage-pages-modal");
const pageListEl = document.getElementById("page-list");

function openManagePages() {
  renderPageList();
  managePagesModal.hidden = false;
}

function closeManagePages() {
  managePagesModal.hidden = true;
}

function renderPageList() {
  pageListEl.innerHTML = "";
  for (const p of pagesFromManifest()) {
    const entries = manifest.filter((e) => e.page === p);
    const included = isIncluded(p);

    const row = document.createElement("label");
    row.className = "page-list-row" + (included ? "" : " excluded");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = included;
    checkbox.addEventListener("change", () => savePageSelectionChange(p, checkbox.checked));

    const thumb = document.createElement("div");
    thumb.className = "plr-thumb";
    const rows = Math.max(...entries.map((e) => e.row)) + 1;
    const cols = Math.max(...entries.map((e) => e.col)) + 1;
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
    label.className = "plr-label";
    label.textContent = pageTitles[p] ? `${p} — ${pageTitles[p]}` : `Page ${p}`;

    row.appendChild(checkbox);
    row.appendChild(thumb);
    row.appendChild(label);
    pageListEl.appendChild(row);
  }
}

async function savePageSelectionChange(page, included) {
  pageSelection[String(page)] = included;
  await fetch("/api/page-selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: currentDevice, changes: { [page]: included } }),
  });
  renderPageList();
}

async function setAllPages(included) {
  const changes = {};
  for (const p of pagesFromManifest()) {
    pageSelection[String(p)] = included;
    changes[p] = included;
  }
  await fetch("/api/page-selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: currentDevice, changes }),
  });
  renderPageList();
}

document.getElementById("manage-pages-btn").addEventListener("click", openManagePages);
document.getElementById("mp-done").addEventListener("click", () => {
  closeManagePages();
  const pages = pagesFromManifest().filter(isIncluded);
  if (!pages.includes(currentPage)) currentPage = pages[0] ?? null;
  renderNav();
  renderDeck();
  renderPanelEmpty();
});
document.getElementById("select-all-btn").addEventListener("click", () => setAllPages(true));
document.getElementById("select-none-btn").addEventListener("click", () => setAllPages(false));
managePagesModal.addEventListener("click", (e) => {
  if (e.target === managePagesModal) closeManagePages();
});

// ---- New Device modal ----

const newDeviceModal = document.getElementById("new-device-modal");
const newDeviceForm = document.getElementById("new-device-form");
const ndProgress = document.getElementById("nd-progress");

function openNewDevice() {
  newDeviceForm.hidden = false;
  newDeviceForm.reset();
  ndProgress.hidden = true;
  ndProgress.textContent = "";
  newDeviceModal.hidden = false;
}

function closeNewDevice() {
  newDeviceModal.hidden = true;
}

newDeviceBtn.addEventListener("click", openNewDevice);
document.getElementById("nd-cancel").addEventListener("click", closeNewDevice);
newDeviceModal.addEventListener("click", (e) => {
  if (e.target === newDeviceModal) closeNewDevice();
});

newDeviceForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(newDeviceForm);
  const payload = {
    host: fd.get("host"),
    port: fd.get("port") || undefined,
    device: fd.get("device") || undefined,
  };

  newDeviceForm.hidden = true;
  ndProgress.hidden = false;
  ndProgress.textContent = "Starting scrape...\n";

  const res = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let doneResult = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    ndProgress.textContent += text;
    ndProgress.scrollTop = ndProgress.scrollHeight;
    const doneMatch = text.match(/__DONE__ (.+)/);
    if (doneMatch) doneResult = JSON.parse(doneMatch[1]);
  }

  if (doneResult) {
    await loadDevices();
    renderDeviceNav();
    await selectDevice(doneResult.device);
    closeNewDevice();
  }
});

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
