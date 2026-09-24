// dpx_deckDoc PUBLIC DEMO viewer — editable, but only in YOUR browser.
// Edits are saved to localStorage, never sent anywhere, never shared with
// other visitors, and never touch the repo. "Reset Demo" wipes them.
//
// This is a fork of site-template/viewer.js (the real, intentionally
// read-only handoff-site viewer) — keep that one untouched; this is the
// public-demo-only variant.

const STORAGE_KEY = "deckdoc-demo-edits-v1";
const pageMatch = location.pathname.match(/page-(\d+)\.html/);
const PAGE = pageMatch ? pageMatch[1] : null;

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveEdits(edits) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {
    // private-mode/blocked storage — edits just won't persist across reloads
  }
}

function editKey(loc) {
  return `${PAGE}/${loc}`;
}

function applyEdit(btn, edit) {
  const fields = ["heading", "body", "notice", "note", "command", "labelOverride"];
  for (const f of fields) {
    if (edit[f]) btn.dataset[f] = edit[f];
    else delete btn.dataset[f];
  }
  btn.classList.toggle("has-notice", Boolean(edit.notice));
  btn.classList.toggle(
    "has-annotation",
    Boolean(edit.heading || edit.body || edit.notice || edit.note || edit.labelOverride)
  );
  let overlay = btn.querySelector(".label-override");
  if (edit.labelOverride) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "label-override";
      btn.appendChild(overlay);
    }
    overlay.textContent = edit.labelOverride;
  } else if (overlay) {
    overlay.remove();
  }
}

function installResetButton() {
  const topbar = document.querySelector(".dpx-topbar");
  if (!topbar || topbar.querySelector(".demo-reset-btn")) return;
  const btn = document.createElement("button");
  btn.className = "demo-reset-btn";
  btn.type = "button";
  btn.textContent = "Reset Demo";
  btn.title = "Clear everything you've edited in this browser and start over";
  btn.addEventListener("click", () => {
    if (!confirm("Reset the demo back to its original state? This only affects your own browser.")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
  topbar.appendChild(btn);

  const badge = document.createElement("span");
  badge.className = "demo-badge";
  badge.textContent = "DEMO — edits stay in your browser only";
  topbar.appendChild(badge);
}

installResetButton();

const panel = document.getElementById("side-panel");
if (panel && PAGE) {
  const deck = document.getElementById("deck");
  const edits = loadEdits();

  // Apply any saved edits for this page before first paint.
  for (const btn of deck.querySelectorAll(".btn")) {
    const edit = edits[editKey(btn.dataset.loc)];
    if (edit) applyEdit(btn, edit);
  }

  let editingBtn = null;

  deck.addEventListener("mouseover", (e) => {
    if (editingBtn) return;
    const btn = e.target.closest(".btn");
    if (!btn) return;
    renderPreview(btn);
  });
  deck.addEventListener("mouseleave", () => {
    if (!editingBtn) renderEmpty();
  });
  deck.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    editingBtn = btn;
    renderEditForm(btn);
  });
}

function renderEmpty() {
  panel.innerHTML = `<p class="empty-hint">Hover a button to preview it. Click to edit — it's a demo, go wild.</p>`;
}

function renderPreview(btn) {
  const { loc, heading, body, notice, note, command } = btn.dataset;
  if (!heading && !body && !notice && !note && !command) {
    panel.innerHTML = `<div class="loc">${loc}</div><p class="empty-hint">No annotation yet. Click to add one.</p>`;
    return;
  }
  panel.innerHTML = `
    <div class="loc">${loc}</div>
    ${heading ? `<div class="heading">${escapeHtml(heading)}</div>` : ""}
    ${body ? `<div class="body-text">${escapeHtml(body)}</div>` : ""}
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
    ${note ? `<div class="note">${escapeHtml(note)}</div>` : ""}
    ${command ? `<div class="command">${escapeHtml(command)}</div>` : ""}
  `;
}

function renderEditForm(btn) {
  const d = btn.dataset;
  panel.innerHTML = `
    <div class="loc">Editing ${d.loc}</div>
    <label>Label override<textarea data-field="labelOverride" rows="1">${escapeHtml(d.labelOverride ?? "")}</textarea></label>
    <label>Heading<textarea data-field="heading" rows="1">${escapeHtml(d.heading ?? "")}</textarea></label>
    <label>Body<textarea data-field="body" rows="3">${escapeHtml(d.body ?? "")}</textarea></label>
    <label>Notice<textarea data-field="notice" rows="2">${escapeHtml(d.notice ?? "")}</textarea></label>
    <label>Note<textarea data-field="note" rows="2">${escapeHtml(d.note ?? "")}</textarea></label>
    <div class="edit-actions">
      <button type="button" class="save-btn">Save</button>
      <button type="button" class="cancel-btn">Cancel</button>
    </div>
  `;
  panel.querySelector(".save-btn").addEventListener("click", () => {
    const edit = {};
    for (const el of panel.querySelectorAll("[data-field]")) {
      edit[el.dataset.field] = el.value.trim();
    }
    const edits = loadEdits();
    edits[editKey(d.loc)] = edit;
    saveEdits(edits);
    applyEdit(btn, edit);
    editingBtn = null;
    renderPreview(btn);
  });
  panel.querySelector(".cancel-btn").addEventListener("click", () => {
    editingBtn = null;
    renderPreview(btn);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
