# Worklish — work × English

**Turn any YouTube video into work insights and the advanced English used to express them.**

Worklish watches a YouTube video (a talk, interview, lecture, or strategy breakdown) and gives you two things at once:

1. **What was said that matters for work** — a short summary, the key insights, and questions to reflect on.
2. **How to say it like that** — the advanced English expressions from the video, with meaning, an example, a usage tip, and a timestamp that jumps you to the exact moment.

It's for people who want to level up their **business/strategy/tech thinking** and their **professional English** from the same source material.

---

## Features

- 📋 **3-sentence summary** of the whole video.
- 🎯 **5 grounded insights** — each backed by a real source quote from the video (no vague advice).
- ❓ **Reflection questions** to make the insights stick.
- 💬 **10 advanced English expressions** — each with `meaning`, an `example`, a `usage tip`, and a **real timestamp**.
- ⏱️ **Timestamps computed in code, not by the model.** The model returns the verbatim phrase; the backend fuzzy-matches it to the transcript to find the true timestamp, and **drops anything it can't verify** — so timestamps don't hallucinate.
- 🌐 **English-only guard** — videos with non-English captions are skipped with a clear message.
- 🎥 **Works even without captions** (Gemini only) — Gemini watches the video natively (capped at ~100 min).
- 🧩 **Chrome side-panel extension** — analyze the video you're currently watching, in place.
- 🗂️ **Optional Notion export** — save analyses to a Notion page you pick once.
- 🔌 **Bring your own model** — Gemini, Ollama (local & free), OpenAI, or Anthropic.

---

## How it works

Worklish is a **deterministic pipeline**, not an autonomous agent framework:

```
YouTube URL
   │
   ├─ fetch English transcript (youtube-transcript-api)
   │
   ├─ has English captions ──► 2 parallel LLM calls: insights + expressions
   │
   └─ no captions (Gemini) ──► 1 native-video call (summary + insights + expressions)
                                   │
                                   └─ code matches each expression phrase to a
                                      transcript chunk → real timestamp (unmatched dropped)
```

Full details in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Setup

### Prerequisites

- **Python 3.12** (a `venv` is recommended)
- **Node.js 18+**
- A **Google Gemini API key** — free tier is plenty for personal use ([get one](https://aistudio.google.com/app/apikey))

### 1. Backend (Flask, port 5001)

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then edit .env (see "Environment variables" below)
python app.py               # → http://localhost:5001
```

### 2. Frontend (React + Vite, port 5173)

```bash
# from the project root
npm install
npm run dev                 # → http://localhost:5173
```

Open `http://localhost:5173`, paste a YouTube URL, and click **Analyze**.

---

## Environment variables

Put these in `backend/.env`:

| Variable | Required | What it is |
|---|---|---|
| `GOOGLE_API_KEY` | ✅ (for Gemini) | Gemini key from **Google AI Studio** (new keys look like `AQ.…`). |
| `YOUTUBE_API_KEY` | ✅ for metadata | **YouTube Data API** key from **Google Cloud Console** (classic `AIza…`). Used to read video title/duration. |
| `LLM_PROVIDER` | optional | `gemini` (default) · `ollama` · `openai` · `anthropic` |
| `GEMINI_MODEL` | optional | defaults to `gemini-3.1-flash-lite` |
| `OLLAMA_MODEL` / `OPENAI_MODEL` / `ANTHROPIC_MODEL` | optional | model override per provider |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | for those providers | API keys |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` / `NOTION_REDIRECT_URI` | optional | only for Notion export |

> **Two-key gotcha (Google):** the new AI Studio `AQ.` keys work for Gemini but are **rejected by the YouTube Data API**. So Worklish uses two keys — an `AQ.` key for Gemini (`GOOGLE_API_KEY`) and a classic `AIza` key for YouTube metadata (`YOUTUBE_API_KEY`). Remove any IP restriction on the YouTube key if your home IP is dynamic.

---

## Bring your own model

The LLM is pluggable — set `LLM_PROVIDER` in `backend/.env`:

| Provider | `LLM_PROVIDER` | Needs | No-caption video |
|---|---|---|---|
| Google Gemini (default) | `gemini` | `GOOGLE_API_KEY` (free tier) | ✅ |
| Ollama (local / free) | `ollama` | [Ollama](https://ollama.com) running + `OLLAMA_MODEL` | ❌ |
| OpenAI | `openai` | `OPENAI_API_KEY` (`pip install openai`) | ❌ |
| Anthropic Claude | `anthropic` | `ANTHROPIC_API_KEY` (`pip install anthropic`) | ❌ |

Run it fully local and free with Ollama:

```bash
ollama pull qwen2.5:7b-instruct
# backend/.env:  LLM_PROVIDER=ollama   OLLAMA_MODEL=qwen2.5:7b-instruct
```

Only **Gemini** can analyze a video with **no captions** (it watches the video natively); the other providers need a captioned video.

---

## Chrome extension

A side panel that analyzes the YouTube video you're currently watching — it's just a UI that calls your local backend, so your API keys never leave your machine.

1. Start the backend (`python app.py` → `http://localhost:5001`).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `extension/` folder.
3. Open any `youtube.com/watch?v=…` page and click the **Worklish** toolbar icon (or the floating **★ Worklish** button).

The extension talks to `POST /api/analyze`; the **Backend** field at the bottom lets you point it at a different URL (e.g. a hosted backend). See [`extension/README.md`](extension/README.md) for details.

---

## API

### `POST /api/analyze`

**Request**
```json
{ "youtube_url": "https://www.youtube.com/watch?v=..." }
```

**Response**
```json
{
  "success": true,
  "video": { "id": "VIDEO_ID", "title": "...", "thumbnail": "...", "duration": 1180 },
  "summary": "Three-sentence summary…",
  "pm_insights": [
    { "title": "...", "description": "...", "source_quote": "..." }
  ],
  "pm_questions": ["...", "..."],
  "english_expressions": [
    {
      "phrase": "...", "meaning": "...", "example": "...",
      "usage_tip": "...", "timestamp": 83, "timestamp_url": "https://youtu.be/...?t=83"
    }
  ]
}
```

`GET /api/health` returns a simple health check. Notion endpoints (`/api/notion/*`, `/api/export/notion`) power the optional export.

---

## Limitations

- Best with **English** videos. Non-English-caption videos are skipped; no-caption videos work **only on Gemini** and are capped at ~100 minutes.
- Quality depends on the chosen model — small local models (≤7B) are noticeably weaker than Gemini for this task.
- Free-tier rate limits apply to your chosen provider.

---

## Project layout

```
backend/        Flask API + services (LLM provider abstraction, YouTube, Notion)
api/            Vercel serverless copy of the backend
src/            React + Vite frontend
extension/      Chrome MV3 side-panel extension
ARCHITECTURE.md How the pipeline actually works
```

---

## License

No license yet — add a `LICENSE` file (e.g. MIT) if you'd like others to reuse the code.

Built by **Jiyae Choi**.
