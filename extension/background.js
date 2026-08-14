// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn("setPanelBehavior:", e));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Open the side panel when the in-page "Worklish" button asks (content.js).
  if (msg && msg.type === "open-worklish" && sender.tab) {
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .catch((e) => console.warn("sidePanel.open (use the toolbar icon instead):", e));
  }
  // The side panel hit a dead port. Force the wake past the debounce — we know
  // the backend is down — and answer once the host has kickstarted it.
  if (msg && msg.type === "wake-backend") {
    wakeBackend("sidepanel-retry", true).then(sendResponse);
    return true; // keep the message channel open for the async reply
  }
});

// --- Wake the local backend when you open a YouTube video ------------------
// The backend runs only on demand (it stops itself when idle). Opening a watch
// page asks a tiny native-messaging host to start it, so it's warm by the time
// you click Analyze. Waking an already-running backend is a harmless no-op.
const WAKER_HOST = "com.worklish.waker";
let lastWakeAt = 0;

// Resolves once the native host replies, so callers can wait for the kickstart
// before retrying a request. Never rejects: a wake we couldn't do is a warning.
function wakeBackend(reason, force = false) {
  const now = Date.now();
  if (!force && now - lastWakeAt < 30000) {
    return Promise.resolve({ ok: false, skipped: "debounced" }); // at most once / 30s
  }
  lastWakeAt = now;
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(WAKER_HOST, { wake: true, reason }, (resp) => {
        if (chrome.runtime.lastError) {
          // Host not installed / not allowed — the side panel still works if the
          // backend is started manually, so this is a warning, not a failure.
          console.warn("worklish wake:", chrome.runtime.lastError.message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          console.debug("worklish wake ->", resp);
          resolve(resp);
        }
      });
    } catch (e) {
      console.warn("worklish wake threw:", e);
      resolve({ ok: false, error: String(e) });
    }
  });
}

function isWatchUrl(url) {
  return !!url && url.startsWith("https://www.youtube.com/watch");
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (isWatchUrl(changeInfo.url || (tab && tab.url))) wakeBackend("tab-updated");
});
