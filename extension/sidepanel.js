const DEFAULT_BACKEND = "http://localhost:5001";

const el = (id) => document.getElementById(id);
let currentVideoId = null;

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
  if (!msg) {
    s.hidden = true;
    return;
  }
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

function render(data) {
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
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = it.title || "";
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = it.description || "";
    card.appendChild(title);
    card.appendChild(desc);
    if (it.source_quote) {
      const q = document.createElement("div");
      q.className = "quote";
      q.textContent = `"${it.source_quote}"`;
      card.appendChild(q);
    }
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

  // Expressions
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

    const phrase = document.createElement("div");
    phrase.className = "phrase";
    phrase.textContent = `"${e.phrase || ""}"`;
    card.appendChild(phrase);

    if (e.meaning) {
      const m = document.createElement("div");
      m.className = "meaning";
      m.textContent = e.meaning;
      card.appendChild(m);
    }
    if (e.example) {
      const c = document.createElement("div");
      c.className = "ctx";
      c.textContent = e.example;
      card.appendChild(c);
    }
    if (e.usage_tip) {
      const t = document.createElement("div");
      t.className = "tip";
      const b = document.createElement("b");
      b.textContent = "Try it";
      t.appendChild(b);
      t.appendChild(document.createTextNode(e.usage_tip));
      card.appendChild(t);
    }
    ex.appendChild(card);
  });
  el("expr-sec").hidden = (data.english_expressions || []).length === 0;

  el("results").hidden = false;
}

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
    render(data);
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

// Init
(async function init() {
  const { backend } = await chrome.storage.local.get("backend");
  el("backend-url").value = backend || DEFAULT_BACKEND;
  el("analyze-btn").addEventListener("click", analyze);
  await refreshVideo();
  chrome.tabs.onActivated.addListener(refreshVideo);
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.url) refreshVideo();
  });
})();
