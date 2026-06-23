import re
from difflib import SequenceMatcher
from pydantic import BaseModel

from services.llm import get_provider


# ---- Structured-output schemas (guarantee the response shape) ----
class PMInsight(BaseModel):
    title: str
    description: str
    source_quote: str


class PMResult(BaseModel):
    summary: str
    insights: list[PMInsight]
    questions: list[str]


class Expression(BaseModel):
    phrase: str
    meaning: str
    example: str
    usage_tip: str


class CombinedVideoResult(BaseModel):
    """Single-call result for the no-transcript video path (PM + English in one response)."""
    summary: str
    insights: list[PMInsight]
    questions: list[str]
    expressions: list[Expression]


def _normalize(text):
    """Lowercase, drop punctuation (keep apostrophes), collapse whitespace — for matching."""
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9'\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---- Prompt builders (single source of truth — reused by the transcript-path calls
#      AND the merged video-path call, so the two never drift apart) ----

def _pm_prompt(video_title):
    return f"""You are helping a product manager learn from a talk or interview transcript.

Video title: {video_title or 'Not provided'}

Write your ENTIRE response in English — summary, titles, descriptions, questions, and source quotes.

First write a "summary": a clear 3-sentence overview of what this video is about and why it is worth watching.

TASK A — Insights (exactly 5)
Extract the 5 most valuable insights for someone in a product or strategy role.
Every insight MUST be grounded in something the speaker actually said — you will quote it.

Rules:
- Only extract insights actually discussed in THIS video. Never invent or force-fit a topic
  the video does not cover. Choose the 5 best-supported, most useful insights.
- Where the video genuinely supports them, favour: product strategy, stakeholder management,
  decision-making, user research, metrics, or leadership. These are a lens, not a checklist —
  do not fabricate to hit them.
- Each insight has:
    - title: 5-8 words, specific (not a topic label)
    - description: 2-4 sentences — what it is AND how to apply it to PM work
    - source_quote: a short line from the transcript it is based on, IN ENGLISH (if the speaker used another language, translate it to natural English)

GOOD: "Use pre-mortems to surface project risks early"; "Build stakeholder buy-in through data storytelling"
BAD (never output): "Communication is important" (generic); "Always listen to users" (obvious); "Be a good leader" (not actionable)

TASK B — Questions (1-2)
Write 1-2 reflection questions that push the reader to APPLY this video's ideas to their own
PM work. Specific and actionable only.
GOOD: "Which current decisions are you basing on feedback when you should be seeking advice instead?"
BAD (never output): "What did you learn?"; "What are the key takeaways for my PM career?"

Return the 3-sentence summary, exactly 5 insights, and 1-2 questions."""


_ENGLISH_PROMPT = """You help a professional learn advanced business English from a talk or interview transcript.

Identify exactly 10 advanced English expressions worth learning for professional and business
settings (meetings, presentations, stakeholder communication).

What counts:
- Reusable phrases, idioms, or collocations — usually 2-6 words. NOT full sentences, NOT long quotes.
- Advanced / professional — the kind executives and thought leaders use. Not casual filler, not everyday phrases.
- Each phrase MUST appear VERBATIM in the transcript. Quote it EXACTLY as spoken — do not paraphrase,
  normalise, or invent. If it is not said word-for-word in the transcript, do not include it.

GOOD: "move the needle"; "table stakes"; "de-risk the initiative"; "socialize the idea";
      "double-click on that"; "greenfield opportunity"; "low-hanging fruit"; "boil the ocean";
      "the deck is stacked against you"
BAD (never output): "good job"; "thank you"; "I think"; "very important"; "let's do it"

Write the meaning, example, and usage_tip in English. For each expression provide:
- phrase: the exact words as spoken (verbatim)
- meaning: a concise plain-English definition (1 sentence)
- example: how it was used in the video (the surrounding context)
- usage_tip: when/how the reader could use it in their own professional communication (1 sentence)

Return exactly 10 expressions."""


class AIService:
    """AI-powered analysis. The LLM is pluggable via LLM_PROVIDER (see services/llm.py);
    Gemini is the default and the only provider that can analyze a no-caption video."""

    def __init__(self):
        self.provider = get_provider()

    def analyze_pm_insights(self, transcript_text=None, video_title=None, video_url=None):
        """3-sentence summary + exactly 5 grounded PM insights + 1-2 questions.

        Returns: {"summary": str, "insights": [{title, description, source_quote}], "questions": [str, ...]}
        """
        prompt = _pm_prompt(video_title)
        try:
            if transcript_text:
                result = self.provider.complete_json(prompt, f"Transcript:\n{transcript_text}", PMResult, "PM Insights")
            elif video_url:
                result = self.provider.complete_json_from_video(prompt, video_url, PMResult, "PM Insights")
            else:
                raise ValueError("Neither transcript_text nor video_url was provided.")
        except Exception as e:
            print(f"ERROR - PM Insights: {e}")
            raise ValueError(f"AI analysis failed: {e}")

        return {
            "summary": result.get("summary") or "",
            "insights": (result.get("insights") or [])[:5],
            "questions": (result.get("questions") or [])[:2],
        }

    def analyze_english_expressions(self, transcript_text=None, video_id=None,
                                    video_url=None, transcript_chunks=None):
        """Up to 10 advanced business-English expressions, with accurate timestamps attached
        in code by matching each verbatim phrase against the transcript chunks.

        Returns: [{phrase, meaning, example, usage_tip, timestamp, timestamp_url}]
        """
        try:
            if transcript_text:
                expressions = self.provider.complete_json(_ENGLISH_PROMPT, f"Transcript:\n{transcript_text}", list[Expression], "English Expressions")
            elif video_url:
                expressions = self.provider.complete_json_from_video(_ENGLISH_PROMPT, video_url, list[Expression], "English Expressions")
            else:
                raise ValueError("Neither transcript_text nor video_url was provided.")
        except Exception as e:
            print(f"ERROR - English Expressions: {e}")
            raise ValueError(f"AI analysis failed: {e}")

        return self._attach_timestamps(expressions, transcript_chunks, video_id)[:10]

    def analyze_video_combined(self, video_url=None, video_id=None, video_title=None):
        """No-transcript path: ONE call that watches the video once and returns BOTH the PM
        analysis and the English expressions. Reuses the exact same prompt text as the two
        separate (transcript-path) calls, so output quality matches — it just halves the cost
        and latency of ingesting the video twice. Gemini-only (other providers can't watch video).

        Returns: {"summary", "insights", "questions", "expressions"}
        """
        combined_prompt = (
            "You are analyzing a YouTube VIDEO directly (no transcript is available — watch and "
            "listen to it). Wherever the instructions below mention 'the transcript', treat it as "
            "THIS video. Produce ALL of the following in a single JSON object: a summary, insights, "
            "questions, and expressions.\n\n"
            "================= PART 1: SUMMARY, INSIGHTS, QUESTIONS =================\n"
            + _pm_prompt(video_title)
            + "\n\n================= PART 2: ENGLISH EXPRESSIONS =================\n"
            + _ENGLISH_PROMPT
        )
        try:
            result = self.provider.complete_json_from_video(combined_prompt, video_url, CombinedVideoResult, "Video Combined")
        except Exception as e:
            print(f"ERROR - Video Combined: {e}")
            raise ValueError(f"AI analysis failed: {e}")

        # No transcript chunks on this path -> timestamps come back null (UI hides the jump button).
        expressions = self._attach_timestamps(result.get("expressions") or [], None, video_id)
        return {
            "summary": result.get("summary") or "",
            "insights": (result.get("insights") or [])[:5],
            "questions": (result.get("questions") or [])[:2],
            "expressions": expressions[:10],
        }

    @staticmethod
    def _attach_timestamps(expressions, transcript_chunks, video_id):
        """Locate each expression's phrase in the timestamped transcript and attach the real
        start time + YouTube deep-link. Phrases that can't be found are dropped (verbatim check)."""
        if not transcript_chunks:
            # No structured transcript (e.g. native-video fallback): no times to look up.
            # Leave timestamp null so the UI hides the jump button (instead of a fake "0:00").
            for e in expressions:
                e["timestamp"] = None
                e["timestamp_url"] = f"https://www.youtube.com/watch?v={video_id}"
            return expressions

        # Build a normalized concatenation with a char-offset -> start-time map.
        offsets = []  # (start_char, start_seconds)
        parts = []
        cursor = 0
        for ch in transcript_chunks:
            t = _normalize(ch.get("text", ""))
            if not t:
                continue
            offsets.append((cursor, float(ch.get("start", 0))))
            parts.append(t)
            cursor += len(t) + 1  # +1 for the joining space
        concat = " ".join(parts)

        def start_at(pos):
            chosen = offsets[0][1] if offsets else 0.0
            for c0, st in offsets:
                if c0 <= pos:
                    chosen = st
                else:
                    break
            return chosen

        kept = []
        for e in expressions:
            phrase = _normalize(e.get("phrase", ""))
            if not phrase:
                continue
            pos = concat.find(phrase)
            if pos >= 0:
                sec = int(start_at(pos))
            else:
                # Fuzzy fallback: chunk with the highest share of the phrase's words.
                ptoks = set(phrase.split())
                best_overlap, best_start = 0.0, None
                if ptoks:
                    for ch in transcript_chunks:
                        ctoks = set(_normalize(ch.get("text", "")).split())
                        overlap = len(ptoks & ctoks) / len(ptoks)
                        if overlap > best_overlap:
                            best_overlap, best_start = overlap, float(ch.get("start", 0))
                if best_overlap >= 0.75 and best_start is not None:
                    sec = int(best_start)
                else:
                    continue  # phrase not in transcript -> drop (likely paraphrase/hallucination)
            e["timestamp"] = sec
            e["timestamp_url"] = f"https://www.youtube.com/watch?v={video_id}&t={sec}s"
            kept.append(e)
        return kept
