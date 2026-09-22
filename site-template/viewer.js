// dpx_deckDoc static viewer — read-only. Hover a button to preview its
// annotation in the side panel. No editing here; use `node src/cli.js serve`
// for the live editable version.

const panel = document.getElementById("side-panel");
if (panel) {
  const deck = document.getElementById("deck");
  deck.addEventListener("mouseover", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    renderPanel(btn);
  });
  deck.addEventListener("mouseleave", () => {
    panel.innerHTML = `<p class="empty-hint">Hover a button to see its annotation.</p>`;
  });
}

function renderPanel(btn) {
  const { loc, heading, body, notice, note, command } = btn.dataset;
  if (!heading && !body && !notice && !note && !command) {
    panel.innerHTML = `<div class="loc">${loc}</div><p class="empty-hint">No annotation yet.</p>`;
    return;
  }
  panel.innerHTML = `
    <div class="loc">${loc}</div>
    ${heading ? `<div class="heading">${heading}</div>` : ""}
    ${body ? `<div class="body-text">${body}</div>` : ""}
    ${notice ? `<div class="notice">${notice}</div>` : ""}
    ${note ? `<div class="note">${note}</div>` : ""}
    ${command ? `<div class="command">${command}</div>` : ""}
  `;
}
