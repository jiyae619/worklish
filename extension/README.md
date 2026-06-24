# Worklish — Chrome Extension

A side panel that analyzes the YouTube video you're watching, using your **local** Worklish backend.
It's just a UI — all the analysis (and your API keys) stay in the backend.

## Load it (unpacked)

1. Start the backend (from `../backend`): `python app.py` → runs on `http://localhost:5001` (set `PORT` to use another port).
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Open any `youtube.com/watch?v=…` page.

## Use it

- Click the **Worklish** toolbar icon (or the floating **★ Worklish** button on the page) to open the side panel.
- Click **Analyze this video** → the summary, insights, questions, and English expressions appear.
- Click a timestamp (▶ 1:23) to jump the video to that moment.
- By default the extension expects the backend on `http://localhost:5001`. If yours runs elsewhere (any local port, or a hosted URL), set it in **⚙ Settings → Backend** at the bottom.

## Flashcards

- Tap **★ Save** on any expression to add it to your flashcard deck. It's stored locally in the browser (`chrome.storage.local`) and **accumulates across sessions** — it persists through restarts until you clear it.
- Open the **Flashcards** tab to study: tap a card to flip it (phrase → meaning + example + usage tip), then **Got it** / **Again** (Again requeues the card later in the session). **▶ Play moment** opens the source video at that timestamp.
- **CSV** exports an Anki/Quizlet-importable file; **JSON** is a full backup. The deck lives per browser profile (`chrome.storage.local`), so exporting is also your backup.

## iPhone wallpapers

Turn your saved expressions into lock-screen wallpapers you glance at all day:

1. In the **Flashcards** tab, tap **📱 Make iPhone wallpapers**.
2. **Shuffle** to preview, then **Download new** — PNGs save to `Downloads/worklish-wallpapers/` (one per card, phone-resolution 1290×2796). It only generates cards you haven't saved before, so re-running won't pile up duplicates (use **↺ reset saved history** to re-download everything).
3. Open the folder and AirDrop the **image files** (not the folder) to your iPhone — they save straight into **Photos**. (AirDropping the folder lands in Files, where they can't be set as wallpaper.)
4. Long-press your **Lock Screen → ＋ → Photo Shuffle → Select Photos Manually**, pick the Worklish images, set a shuffle frequency.

Your lock screen now rotates through your expressions — passive review on every glance. The phrase is rendered in dim gray so it's legible to you up close but not to onlookers. Everything is generated locally; no backend or account needed.

## Notes

- The backend must be running and reachable; the extension calls `POST /api/analyze`.
- It analyzes whatever provider the backend is configured with (`LLM_PROVIDER`) — Gemini, Ollama, OpenAI, or Anthropic.
- Videos need English captions unless the backend uses Gemini (which can watch a no-caption video).
- Hosting it for others would mean pointing `Backend` at a deployed URL and enabling that backend's cost caps.
