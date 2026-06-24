# Worklish — Architecture

Worklish analyzes a YouTube video and returns, for English learners in product / strategy / tech roles:

- a 3-sentence **summary**,
- 5 grounded **insights** (each with a source quote) + 1–2 reflection **questions**,
- up to 10 advanced **English expressions** (meaning, in-context example, usage tip, click-to-timestamp).

It is a **deterministic request/response pipeline — not an agent system.** There is no orchestrator,
no autonomous loop, no tool selection. (The previous `agents/*.md` files described an aspirational
"mother agent + subagents" design that was never implemented; this document replaces them.)

## Flow

```
Frontend (React / Vite)              Backend (Flask — backend/app.py, api/index.py)
─────────────────────                ──────────────────────────────────────────────
App.jsx ──POST /api/analyze──▶  1. extract video_id
  { youtube_url }               2. YouTubeService.get_video_metadata()  → YouTube Data API (YOUTUBE_API_KEY, AIza)
                                3. YouTubeService.get_transcript()       → youtube-transcript-api (English)
                                     • non-English captions → BLOCK ("English videos only")
                                     • captions disabled / none → native-video fallback (Gemini reads the URL)
                                4. run IN PARALLEL (ThreadPoolExecutor, 2 workers):
                                     • AIService.analyze_pm_insights()         → { summary, insights, questions }
                                     • AIService.analyze_english_expressions()  → [ up to 10 expressions ]
                                          then _attach_timestamps(): match each VERBATIM phrase to a
                                          transcript chunk → real timestamp; drop phrases not found
                                5. return { video, summary, pm_insights, pm_questions, english_expressions }
Results.jsx ◀──── JSON ────           (renders Insights / Expressions tabs; optional Notion export)
```

## Components

- **Frontend** (`src/`): `App.jsx` (landing + submit), `Results.jsx` (results shell + Notion export),
  `PMInsights.jsx`, `EnglishExpressions.jsx`, `LoadingAnalysis.jsx`, `NotionCallback.jsx`.
- **Backend** — two synced copies: `backend/` (local dev, Flask on `:5001` by default, override with `PORT`) and `api/` (Vercel entry `index.py`).
  - `services/ai_service.py` — Gemini calls (`gemini-3.1-flash-lite`); structured output via `response_schema`
    (Pydantic); code-based timestamp lookup + verbatim verification; `temperature` 0.2.
  - `services/youtube_service.py` — transcript fetch (English-only guard via `_available_languages`) + metadata.
  - `services/notion_service.py` — export an analysis to a user's Notion page.

## Key design decisions

- **Two Gemini calls per video** (PM + English, in parallel). Free tier ≈ 1,000 requests/day → ~500 videos/day.
- **Structured output** (`response_schema`) guarantees the JSON shape — no fragile parsing.
- **Timestamps are computed in code, not by the model.** Each verbatim phrase is matched against the
  timestamped transcript chunks to get an exact time; phrases that can't be found are dropped (this
  both fixes timestamp accuracy and removes hallucinated expressions).
- **English-only.** Videos whose captions are in another language are blocked *before* any Gemini call.
- **No-transcript fallback.** With no captions, Gemini "watches" the YouTube URL directly. Gemini 3.1
  Flash-Lite handles **~45 min of video per request** (1M-token context, default resolution), so this
  path is length-limited and the most expensive — intended to be capped at **≤40 min**.

## Auth

- **Gemini** — AI Studio "auth key" (`AQ.` format) in `GOOGLE_API_KEY`, used via the API-key path
  (free tier, no billing required). `GOOGLE_CLOUD_PROJECT` is left unset locally so the code avoids
  Vertex AI (which would need a service account).
- **YouTube Data API** — classic `AIza` key in `YOUTUBE_API_KEY` (create it in Google Cloud Console;
  AI Studio now only issues `AQ.` keys, which the YouTube Data API rejects).
