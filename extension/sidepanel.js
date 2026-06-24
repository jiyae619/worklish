const DEFAULT_BACKEND = "http://localhost:5001";
const DECK_KEY = "flashcards";
const WP_EXPORTED_KEY = "wallpaper_exported";

const el = (id) => document.getElementById(id);
let currentVideoId = null;
let currentVideo = null; // {id, title, url, ...} from the most recent analysis

/* ───────────────────────── deck storage (persists across sessions) ───────────────────────── */
async function getDeck() {
  const data = await chrome.storage.local.get(DECK_KEY);
  return Array.isArray(data[DECK_KEY]) ? data[DECK_KEY] : [];
}
async function setDeck(deck) {
  await chrome.storage.local.set({ [DECK_KEY]: deck });
}
// Tracks which card ids have already been saved as wallpapers, so we never re-download the same image.
async function getExported() {
  const data = await chrome.storage.local.get(WP_EXPORTED_KEY);
  return new Set(Array.isArray(data[WP_EXPORTED_KEY]) ? data[WP_EXPORTED_KEY] : []);
}
async function setExported(set) {
  await chrome.storage.local.set({ [WP_EXPORTED_KEY]: [...set] });
}
function cardId(videoId, phrase) {
  return `${videoId || "?"}::${String(phrase || "").trim().toLowerCase()}`;
}
async function addCard(card) {
  const deck = await getDeck();
  const id = cardId(card.video_id, card.phrase);
  if (deck.some((c) => c.id === id)) return false; // dedupe: same phrase from same video
  deck.push({ id, ...card, added_at: new Date().toISOString() });
  await setDeck(deck);
  return true;
}
async function removeCard(id) {
  const deck = (await getDeck()).filter((c) => c.id !== id);
  await setDeck(deck);
  return deck;
}

/* ───────────────────────── small helpers ───────────────────────── */
function extractVideoId(url) {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function refreshVideo() {
  const tab = await getActiveTab();
  currentVideoId = extractVideoId(tab && tab.url);
  if (currentVideoId) {
    el("video-info").textContent = "Ready to analyze the current video.";
    el("analyze-btn").disabled = false;
  } else {
    el("video-info").textContent = "Open a YouTube video, then analyze it.";
    el("analyze-btn").disabled = true;
  }
}
function setStatus(msg, isError) {
  const s = el("status");
  if (!msg) { s.hidden = true; return; }
  s.hidden = false;
  s.textContent = msg;
  s.classList.toggle("error", !!isError);
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function seekTo(url) {
  getActiveTab().then((tab) => {
    if (tab) chrome.tabs.update(tab.id, { url });
  });
}
function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
function div(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}
async function refreshBadge() {
  const n = (await getDeck()).length;
  const b = el("fc-badge");
  b.textContent = String(n);
  b.hidden = n === 0;
}

/* ───────────────────────── analyze render ───────────────────────── */
async function render(data) {
  currentVideo = data.video || { id: currentVideoId };

  // Summary
  if (data.summary) {
    el("summary").textContent = data.summary;
    el("summary-sec").hidden = false;
  } else {
    el("summary-sec").hidden = true;
  }

  // Insights
  const ins = el("insights");
  clear(ins);
  (data.pm_insights || []).forEach((it) => {
    const card = document.createElement("div");
    card.className = "card";
    const title = div("title", it.title || "");
    const desc = div("desc", it.description || "");
    card.appendChild(title);
    card.appendChild(desc);
    if (it.source_quote) card.appendChild(div("quote", `"${it.source_quote}"`));
    ins.appendChild(card);
  });

  // Questions
  const ql = el("questions");
  clear(ql);
  const questions = data.pm_questions || [];
  el("q-head").hidden = questions.length === 0;
  questions.forEach((q) => {
    const li = document.createElement("li");
    li.textContent = q;
    ql.appendChild(li);
  });
  el("insights-sec").hidden = (data.pm_insights || []).length === 0;

  // Expressions (with Save-to-flashcards)
  const savedIds = new Set((await getDeck()).map((c) => c.id));
  const ex = el("expressions");
  clear(ex);
  (data.english_expressions || []).forEach((e) => {
    const card = document.createElement("div");
    card.className = "card expr";

    if (e.timestamp != null && e.timestamp_url) {
      const ts = document.createElement("span");
      ts.className = "ts";
      ts.textContent = "▶ " + fmtTime(e.timestamp);
      ts.addEventListener("click", () => seekTo(e.timestamp_url));
      card.appendChild(ts);
    }

    card.appendChild(Object.assign(div("phrase"), { textContent: `"${e.phrase || ""}"` }));
    if (e.meaning) card.appendChild(div("meaning", e.meaning));
    if (e.example) card.appendChild(div("ctx", e.example));
    if (e.usage_tip) {
      const t = div("tip");
      const b = document.createElement("b");
      b.textContent = "Try it";
      t.appendChild(b);
      t.appendChild(document.createTextNode(e.usage_tip));
      card.appendChild(t);
    }

    // Save button
    const save = document.createElement("button");
    save.className = "save-btn";
    const id = cardId(currentVideo.id || currentVideoId, e.phrase);
    const setLabel = (saved) => {
      save.textContent = saved ? "✓ Saved" : "★ Save";
      save.classList.toggle("saved", saved);
    };
    setLabel(savedIds.has(id));
    save.addEventListener("click", async () => {
      const already = (await getDeck()).some((c) => c.id === id);
      if (already) {
        await removeCard(id);
        setLabel(false);
      } else {
        await addCard({
          phrase: e.phrase,
          meaning: e.meaning || "",
          example: e.example || "",
          usage_tip: e.usage_tip || "",
          timestamp: e.timestamp ?? null,
          timestamp_url: e.timestamp_url || null,
          video_id: currentVideo.id || currentVideoId,
          video_title: currentVideo.title || "",
          video_url: currentVideo.url || `https://www.youtube.com/watch?v=${currentVideo.id || currentVideoId}`,
        });
        setLabel(true);
      }
      await refreshBadge();
    });
    card.appendChild(save);

    ex.appendChild(card);
  });
  el("expr-sec").hidden = (data.english_expressions || []).length === 0;

  el("results").hidden = false;
}

/* ───────────────────────── analyze flow ───────────────────────── */
async function postAnalyze(backend, youtubeUrl) {
  const resp = await fetch(`${backend}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  });
  return resp.json();
}

async function analyze() {
  if (!currentVideoId) return;
  const backend = (el("backend-url").value.trim() || DEFAULT_BACKEND).replace(/\/$/, "");
  await chrome.storage.local.set({ backend });

  el("analyze-btn").disabled = true;
  el("results").hidden = true;
  setStatus("Analyzing… fetching transcript + AI (~15s).");

  const youtubeUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
  try {
    let data;
    try {
      data = await postAnalyze(backend, youtubeUrl);
    } catch (netErr) {
      // The backend wakes on YouTube visits and sleeps when idle — the first
      // request after idle can land before it's up. Wait briefly and retry once.
      if (/Failed to fetch|NetworkError/i.test(String(netErr))) {
        setStatus("Starting the backend… (first request after idle)");
        await new Promise((r) => setTimeout(r, 2500));
        data = await postAnalyze(backend, youtubeUrl);
      } else {
        throw netErr;
      }
    }
    if (!data.success) throw new Error(data.error || "Analysis failed");
    await render(data);
    setStatus("");
  } catch (err) {
    const msg = String(err.message || err);
    const hint = /high demand|503|UNAVAILABLE/i.test(msg) ? " — Gemini is busy, click Analyze again." : "";
    const conn = /Failed to fetch|NetworkError/i.test(msg) ? ` — can't reach the backend at ${backend}. Is it running? If it's on a different port, set its URL in ⚙ Settings → Backend.` : "";
    setStatus("⚠ " + msg + hint + conn, true);
  } finally {
    el("analyze-btn").disabled = false;
  }
}

/* ───────────────────────── flashcards: study session ───────────────────────── */
let session = []; // cards queued for this study run
let sessionPos = 0;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function openFlashcards() {
  const deck = await getDeck();
  el("fc-count").textContent = `${deck.length} card${deck.length === 1 ? "" : "s"}`;
  el("fc-wallpaper").hidden = true;
  if (deck.length === 0) {
    el("fc-empty").hidden = false;
    el("fc-study").hidden = true;
    el("fc-done").hidden = true;
    el("fc-wallpaper-open").hidden = true;
    return;
  }
  el("fc-empty").hidden = true;
  el("fc-wallpaper-open").hidden = false;
  session = shuffle(deck.slice());
  sessionPos = 0;
  el("fc-done").hidden = true;
  el("fc-study").hidden = false;
  showCard();
}

function showCard() {
  if (sessionPos >= session.length) return finishSession();
  const c = session[sessionPos];
  el("fc-progress").textContent = `${sessionPos + 1} / ${session.length}`;
  el("fc-front").textContent = `"${c.phrase}"`;
  el("fc-front").hidden = false;
  el("fc-hint").hidden = false;

  const back = el("fc-back");
  clear(back);
  if (c.meaning) back.appendChild(div("fc-b-meaning", c.meaning));
  if (c.example) back.appendChild(div("fc-b-ex", c.example));
  if (c.usage_tip) {
    const t = div("fc-b-tip");
    const b = document.createElement("b");
    b.textContent = "Try it";
    t.appendChild(b);
    t.appendChild(document.createTextNode(" " + c.usage_tip));
    back.appendChild(t);
  }
  back.hidden = true;

  // Source clip title stays visible (not just on flip) so you know what "Play moment" refers to.
  const src = el("fc-source");
  src.textContent = c.video_title ? `▶ from “${c.video_title}”` : "";
  src.hidden = !c.video_title;
  el("fc-play").style.display = c.timestamp_url ? "" : "none";
}

function flip() {
  const back = el("fc-back");
  const showBack = back.hidden;
  back.hidden = !showBack;
  el("fc-front").hidden = showBack;
  el("fc-hint").hidden = showBack;
}

function gotIt() {
  sessionPos++;
  showCard();
}
function again() {
  // requeue the current card to the end of this session
  const c = session.splice(sessionPos, 1)[0];
  if (c) session.push(c);
  showCard();
}
async function finishSession() {
  const deck = await getDeck();
  el("fc-study").hidden = true;
  el("fc-done").hidden = false;
  el("fc-done-n").textContent = String(deck.length);
}
function playMoment() {
  const c = session[sessionPos];
  if (c && c.timestamp_url) chrome.tabs.create({ url: c.timestamp_url });
}
async function deleteCurrent() {
  const c = session[sessionPos];
  if (!c) return;
  await removeCard(c.id);
  session.splice(sessionPos, 1);
  await refreshBadge();
  const deck = await getDeck();
  el("fc-count").textContent = `${deck.length} card${deck.length === 1 ? "" : "s"}`;
  if (deck.length === 0) {
    el("fc-study").hidden = true;
    el("fc-empty").hidden = false;
  } else if (sessionPos >= session.length) {
    finishSession();
  } else {
    showCard();
  }
}

/* ───────────────────────── flashcards: export / import / clear ───────────────────────── */
function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function exportCsv() {
  const deck = await getDeck();
  if (!deck.length) return;
  const cols = ["phrase", "meaning", "example", "usage_tip", "timestamp", "video_title", "video_url", "added_at"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.join(","), ...deck.map((c) => cols.map((k) => esc(c[k])).join(","))];
  download(`worklish-flashcards-${dateStamp()}.csv`, lines.join("\n"), "text/csv");
}
async function exportJson() {
  const deck = await getDeck();
  if (!deck.length) return;
  download(`worklish-flashcards-${dateStamp()}.json`, JSON.stringify(deck, null, 2), "application/json");
}
async function clearDeck() {
  const deck = await getDeck();
  if (!deck.length) return;
  if (!confirm(`Delete all ${deck.length} flashcards? This can't be undone.`)) return;
  await setDeck([]);
  await refreshBadge();
  await openFlashcards();
}

/* ───────────────────────── flashcards: iPhone wallpapers ───────────────────────── */
const WP_W = 1290, WP_H = 2796; // iPhone-class portrait; scales down on any phone

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (line && ctx.measureText(t).width > maxWidth) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function drawBlock(ctx, text, o) {
  ctx.font = o.font;
  ctx.fillStyle = o.color;
  ctx.textAlign = "center";
  let y = o.y;
  for (const ln of wrapLines(ctx, text, o.maxWidth)) { ctx.fillText(ln, o.x, y); y += o.lineHeight; }
  return y;
}
function renderWallpaper(card) {
  const c = document.createElement("canvas");
  c.width = WP_W; c.height = WP_H;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, WP_H);
  g.addColorStop(0, "#0c1a13"); g.addColorStop(1, "#0a130e");
  ctx.fillStyle = g; ctx.fillRect(0, 0, WP_W, WP_H);
  const cx = WP_W / 2, maxW = WP_W - 240;
  ctx.textAlign = "center";
  // phrase — dim gray on a dark field, legible to you up close but not to onlookers
  let y = 1380;
  y = drawBlock(ctx, `“${card.phrase}”`, { x: cx, y, maxWidth: maxW, font: "600 72px Georgia, serif", color: "#626e67", lineHeight: 90 });
  if (card.meaning) {
    y += 28;
    y = drawBlock(ctx, card.meaning, { x: cx, y, maxWidth: maxW, font: "400 46px -apple-system, system-ui, sans-serif", color: "#7e8b82", lineHeight: 64 });
  }
  y += 44;
  ctx.strokeStyle = "#1c8043"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - 70, y); ctx.lineTo(cx + 70, y); ctx.stroke();
  y += 60;
  if (card.example) {
    y = drawBlock(ctx, card.example, { x: cx, y, maxWidth: maxW, font: "italic 400 38px Georgia, serif", color: "#63706a", lineHeight: 54 });
  }
  return c;
}
function canvasToBlobUrl(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(URL.createObjectURL(b)), "image/png"));
}
function slugify(s) {
  return String(s || "card").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "card";
}

let wpDeck = [];
async function openWallpaper() {
  wpDeck = await getDeck();
  if (!wpDeck.length) return;
  el("fc-empty").hidden = true;
  el("fc-study").hidden = true;
  el("fc-done").hidden = true;
  el("fc-wallpaper-open").hidden = true;
  el("fc-wallpaper").hidden = false;
  const exported = await getExported();
  const fresh = wpDeck.filter((c) => !exported.has(c.id)).length;
  el("wp-status").textContent = `${wpDeck.length} card${wpDeck.length === 1 ? "" : "s"} in your deck · ${fresh} not yet saved`;
  el("wp-reset").hidden = exported.size === 0;
  wpPreview();
}
function wpPreview() {
  if (!wpDeck.length) return;
  const card = wpDeck[Math.floor(Math.random() * wpDeck.length)];
  el("wp-preview").src = renderWallpaper(card).toDataURL("image/png");
}
async function wpDownloadAll() {
  if (!wpDeck.length) return;
  const MAX = 25;
  const exported = await getExported();
  const fresh = wpDeck.filter((c) => !exported.has(c.id)); // only cards never saved before
  if (!fresh.length) {
    el("wp-status").textContent = `All caught up — every card is already saved. Nothing new to download.`;
    return;
  }
  const pick = shuffle(fresh.slice()).slice(0, MAX);
  el("wp-download").disabled = true;
  el("wp-status").textContent = `Generating ${pick.length} new wallpaper${pick.length === 1 ? "" : "s"}…`;
  let done = 0;
  for (let i = 0; i < pick.length; i++) {
    const url = await canvasToBlobUrl(renderWallpaper(pick[i]));
    await new Promise((resolve) => {
      chrome.downloads.download(
        {
          url,
          filename: `worklish-wallpapers/${String(i + 1).padStart(2, "0")}-${slugify(pick[i].phrase)}.png`,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (downloadId !== undefined) { done++; exported.add(pick[i].id); } // only mark saved on success
          setTimeout(() => URL.revokeObjectURL(url), 8000);
          resolve();
        }
      );
    });
  }
  await setExported(exported);
  el("wp-reset").hidden = exported.size === 0;
  el("wp-download").disabled = false;
  const remaining = fresh.length - done;
  el("wp-status").textContent =
    `Saved ${done} new → Downloads/worklish-wallpapers/.` +
    (remaining > 0 ? ` ${remaining} more not yet saved — click again for the next batch.` : "");
}
async function wpResetExported() {
  await setExported(new Set());
  await openWallpaper();
}

/* ───────────────────────── view switching ───────────────────────── */
function showView(which) {
  const analyze = which === "analyze";
  el("view-analyze").hidden = !analyze;
  el("view-flashcards").hidden = analyze;
  el("tab-analyze").classList.toggle("active", analyze);
  el("tab-flashcards").classList.toggle("active", !analyze);
  if (!analyze) openFlashcards();
}

/* ───────────────────────── init ───────────────────────── */
(async function init() {
  const { backend } = await chrome.storage.local.get("backend");
  el("backend-url").value = backend || DEFAULT_BACKEND;

  el("analyze-btn").addEventListener("click", analyze);
  el("backend-url").addEventListener("change", async () => {
    const v = el("backend-url").value.trim().replace(/\/$/, "");
    await chrome.storage.local.set({ backend: v || DEFAULT_BACKEND });
  });
  el("tab-analyze").addEventListener("click", () => showView("analyze"));
  el("tab-flashcards").addEventListener("click", () => showView("flashcards"));

  el("fc-card").addEventListener("click", flip);
  el("fc-again").addEventListener("click", again);
  el("fc-got").addEventListener("click", gotIt);
  el("fc-play").addEventListener("click", playMoment);
  el("fc-delete").addEventListener("click", deleteCurrent);
  el("fc-restart").addEventListener("click", openFlashcards);
  el("fc-csv").addEventListener("click", exportCsv);
  el("fc-json").addEventListener("click", exportJson);
  el("fc-clear").addEventListener("click", clearDeck);
  el("fc-wallpaper-open").addEventListener("click", openWallpaper);
  el("wp-shuffle").addEventListener("click", wpPreview);
  el("wp-download").addEventListener("click", wpDownloadAll);
  el("wp-reset").addEventListener("click", wpResetExported);
  el("wp-back").addEventListener("click", openFlashcards);

  await refreshBadge();
  await refreshVideo();
  chrome.tabs.onActivated.addListener(refreshVideo);
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url) refreshVideo();
  });
})();
