# Worklish — Chrome Extension

A side panel that analyzes the YouTube video you're watching, using your **local** Worklish backend.
It's just a UI — all the analysis (and your API keys) stay in the backend.

## Load it (unpacked)

1. Start the backend (from `../backend`): `python app.py` → runs on `http://localhost:5001`.
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Open any `youtube.com/watch?v=…` page.

## Use it

- Click the **Worklish** toolbar icon (or the floating **★ Worklish** button on the page) to open the side panel.
- Click **Analyze this video** → the summary, insights, questions, and English expressions appear.
- Click a timestamp (▶ 1:23) to jump the video to that moment.
- The **Backend** field at the bottom lets you point at a different backend URL (default `http://localhost:5001`).

## Flashcards

- Tap **★ Save** on any expression to add it to your flashcard deck. It's stored locally in the browser (`chrome.storage.local`) and **accumulates across sessions** — it persists through restarts until you clear it.
- Open the **Flashcards** tab to study: tap a card to flip it (phrase → meaning + example + usage tip), then **Got it** / **Again** (Again requeues the card later in the session). **▶ Play moment** opens the source video at that timestamp.
- **CSV** exports an Anki/Quizlet-importable file; **JSON** is a full backup you can re-**Import** later (e.g. to move your deck to another machine). The deck lives per browser profile, so export is also your backup.

## Notes

- The backend must be running and reachable; the extension calls `POST /api/analyze`.
- It analyzes whatever provider the backend is configured with (`LLM_PROVIDER`) — Gemini, Ollama, OpenAI, or Anthropic.
- Videos need English captions unless the backend uses Gemini (which can watch a no-caption video).
- Hosting it for others would mean pointing `Backend` at a deployed URL and enabling that backend's cost caps.
