// Injects a floating "Worklish" button on YouTube watch pages.
// Clicking it asks the background service worker to open the side panel.
(function () {
  function addButton() {
    if (document.getElementById("worklish-btn")) return;
    const btn = document.createElement("button");
    btn.id = "worklish-btn";
    btn.textContent = "★ Worklish";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "99999",
      background: "#141414",
      color: "#E4E3E0",
      border: "2px solid #141414",
      padding: "10px 16px",
      font: "700 12px/1 system-ui, -apple-system, sans-serif",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      cursor: "pointer",
      boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
    });
    btn.addEventListener("mouseenter", () => (btn.style.background = "#166534"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#141414"));
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-worklish" });
    });
    document.body.appendChild(btn);
  }

  addButton();

  // YouTube is a single-page app — re-add the button after in-app navigation.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      addButton();
    }
  }, 1000);
})();
