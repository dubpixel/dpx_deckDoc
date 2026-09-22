// Viewing-mode toggle (tooltip vs. margin-note). No build step, no deps.
const toggle = document.querySelector(".mode-toggle");
if (toggle) {
  toggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;

    for (const b of toggle.querySelectorAll("button")) b.classList.remove("active");
    btn.classList.add("active");

    document.body.classList.toggle("mode-margin", btn.dataset.mode === "margin");
  });
}
