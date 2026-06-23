// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn("setPanelBehavior:", e));

// Open the side panel when the in-page "Worklish" button asks (content.js).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "open-worklish" && sender.tab) {
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .catch((e) => console.warn("sidePanel.open (use the toolbar icon instead):", e));
  }
});

// --- Wake the local backend when you open a YouTube video ------------------
// The backend runs only on demand (it stops itself when idle). Opening a watch
// page asks a tiny native-messaging host to start it, so it's warm by the time
// you click Analyze. Waking an already-running backend is a harmless no-op.
const WAKER_HOST = "com.worklish.waker";
let lastWakeAt = 0;

function wakeBackend(reason) {
  const now = Date.now();
  if (now - lastWakeAt < 30000) return; // debounce: at most once / 30s
  lastWakeAt = now;
  try {
    chrome.runtime.sendNativeMessage(WAKER_HOST, { wake: true, reason }, (resp) => {
      if (chrome.runtime.lastError) {
        // Host not installed / not allowed — the side panel still works if the
        // backend is started manually, so this is a warning, not a failure.
        console.warn("worklish wake:", chrome.runtime.lastError.message);
      } else {
        console.debug("worklish wake ->", resp);
      }
    });
  } catch (e) {
    console.warn("worklish wake threw:", e);
  }
}

function isWatchUrl(url) {
  return !!url && url.startsWith("https://www.youtube.com/watch");
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (isWatchUrl(changeInfo.url || (tab && tab.url))) wakeBackend("tab-updated");
});
