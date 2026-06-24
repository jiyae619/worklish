const DEFAULT_BACKEND = "http://localhost:5001";
const DECK_KEY = "flashcards";

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
    const conn = /Failed to fetch|NetworkError/i.test(msg) ? " — is the backend running on " + backend + "?" : "";
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
  if (deck.length === 0) {
    el("fc-empty").hidden = false;
    el("fc-study").hidden = true;
    el("fc-done").hidden = true;
    return;
  }
  el("fc-empty").hidden = true;
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
  if (c.video_title) back.appendChild(div("fc-b-src", `from “${c.video_title}”`));
  back.hidden = true;

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
async function handleImportFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming)) throw new Error("expected a JSON array of cards");
    const byId = new Map((await getDeck()).map((c) => [c.id, c]));
    let added = 0;
    for (const c of incoming) {
      if (!c || !c.phrase) continue;
      const id = c.id || cardId(c.video_id, c.phrase);
      if (!byId.has(id)) { byId.set(id, { ...c, id }); added++; }
    }
    await setDeck([...byId.values()]);
    await refreshBadge();
    await openFlashcards();
    alert(`Imported ${added} new card${added === 1 ? "" : "s"}.`);
  } catch (e) {
    alert("Import failed: " + (e.message || e));
  } finally {
    ev.target.value = "";
  }
}
async function clearDeck() {
  const deck = await getDeck();
  if (!deck.length) return;
  if (!confirm(`Delete all ${deck.length} flashcards? This can't be undone.`)) return;
  await setDeck([]);
  await refreshBadge();
  await openFlashcards();
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
  el("fc-import").addEventListener("click", () => el("fc-file").click());
  el("fc-file").addEventListener("change", handleImportFile);
  el("fc-clear").addEventListener("click", clearDeck);

  await refreshBadge();
  await refreshVideo();
  chrome.tabs.onActivated.addListener(refreshVideo);
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url) refreshVideo();
  });
})();
