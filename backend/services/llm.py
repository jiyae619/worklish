"""Pluggable LLM providers — choose via the LLM_PROVIDER env var.

    LLM_PROVIDER = gemini (default) | ollama | openai | anthropic

Each provider returns parsed JSON validated against a Pydantic schema (a model class or
list[Model]). Only Gemini can analyze a video that has no captions (native video
understanding); the others raise on that path, so transcript-less videos need Gemini.

Per-provider model + connection are read from the environment so a forker can bring their
own model with their own key:
    GEMINI_MODEL (default gemini-3.1-flash-lite)   + GOOGLE_API_KEY / GOOGLE_CLOUD_PROJECT
    OLLAMA_MODEL (default llama3.2:3b)             + OLLAMA_HOST (default http://localhost:11434)
    OPENAI_MODEL (default gpt-4o-mini)            + OPENAI_API_KEY
    ANTHROPIC_MODEL (default claude-opus-4-8)     + ANTHROPIC_API_KEY
"""
import os
import re
import json
import typing
import urllib.request

_VIDEO_UNSUPPORTED = ("This LLM provider cannot analyze a video without captions. "
                      "Use Gemini (LLM_PROVIDER=gemini), or a video that has English captions.")


def _extract_json(text):
    """Pull a JSON object/array out of model text (handles ``` fences and stray prose)."""
    if not text:
        raise ValueError("Empty LLM response")
    t = text.strip()
    if '```json' in t:
        t = t.split('```json', 1)[1].split('```', 1)[0]
    elif '```' in t:
        t = t.split('```', 1)[1].split('```', 1)[0]
    t = t.strip()
    if not (t.startswith('{') or t.startswith('[')):
        m = re.search(r'[\[{][\s\S]*[\]}]', t)
        if m:
            t = m.group(0)
    return json.loads(t)


def _coerce(data, schema):
    """Return plain python matching `schema`. For list[Model], accept a bare array OR an
    object that wraps the array (e.g. {"items": [...]}) and unwrap it."""
    if typing.get_origin(schema) in (list, typing.List):
        if isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    data = v
                    break
        return data if isinstance(data, list) else []
    return data


def _json_schema(schema):
    """JSON Schema for a Pydantic model or list[Model] (for providers that take one).
    Arrays are wrapped in an object so providers that require a top-level object work."""
    if typing.get_origin(schema) in (list, typing.List):
        (item,) = typing.get_args(schema)
        return {
            "type": "object",
            "properties": {"items": {"type": "array", "items": item.model_json_schema()}},
            "required": ["items"],
        }
    return schema.model_json_schema()


class GeminiProvider:
    """Default. Holds ALL Gemini specifics (structured output, low media resolution, native
    video) so the rest of the app is provider-agnostic. Behavior is unchanged from before."""
    supports_video = True

    def __init__(self):
        from google import genai
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
        location = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')
        if not project_id:
            print("WARNING: GOOGLE_CLOUD_PROJECT not found. Falling back to simple API key (native video URL parsing will fail).")
            api_key = os.getenv('GOOGLE_API_KEY')
            if not api_key:
                raise ValueError("Neither GOOGLE_CLOUD_PROJECT nor GOOGLE_API_KEY found in environment variables")
            self.client = genai.Client(api_key=api_key)
        else:
            self.client = genai.Client(vertexai=True, project=project_id, location=location)
        self.model = os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite')

    def _call(self, parts, schema):
        from google.genai import types
        resp = self.client.models.generate_content(
            model=self.model,
            contents=parts,
            config={
                "temperature": 0.2,
                "max_output_tokens": 8192,
                "response_mime_type": "application/json",
                "response_schema": schema,
                "media_resolution": types.MediaResolution.MEDIA_RESOLUTION_LOW,
            },
        )
        parsed = getattr(resp, "parsed", None)
        if parsed is not None:
            if isinstance(parsed, list):
                return [p.model_dump() if hasattr(p, "model_dump") else p for p in parsed]
            return parsed.model_dump() if hasattr(parsed, "model_dump") else parsed
        return _coerce(_extract_json(resp.text), schema)

    def complete_json(self, prompt, user_text, schema, context=""):
        parts = []
        if user_text:
            parts.append(user_text)
        parts.append(prompt)
        return self._call(parts, schema)

    def complete_json_from_video(self, prompt, video_url, schema, context=""):
        from google.genai import types
        parts = [types.Part.from_uri(file_uri=video_url, mime_type="video/mp4"), prompt]
        return self._call(parts, schema)


class OllamaProvider:
    """Local / free models via Ollama (http://localhost:11434). No video support."""
    supports_video = False

    def __init__(self):
        self.host = os.getenv('OLLAMA_HOST', 'http://localhost:11434')
        self.model = os.getenv('OLLAMA_MODEL', 'llama3.2:3b')

    def complete_json(self, prompt, user_text, schema, context=""):
        full = (f"{user_text}\n\n" if user_text else "") + prompt + "\n\nReturn ONLY valid JSON, no prose or markdown."
        body = json.dumps({
            "model": self.model,
            "prompt": full,
            "stream": False,
            "format": _json_schema(schema),  # Ollama structured output (JSON schema)
            "options": {"temperature": 0.2},
        }).encode()
        req = urllib.request.Request(self.host + "/api/generate", data=body,
                                     headers={"Content-Type": "application/json"})
        resp = json.load(urllib.request.urlopen(req, timeout=600))
        return _coerce(_extract_json(resp.get("response", "")), schema)

    def complete_json_from_video(self, *a, **k):
        raise ValueError(_VIDEO_UNSUPPORTED)


class OpenAIProvider:
    """OpenAI (bring your own key). No video support."""
    supports_video = False

    def __init__(self):
        self.model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
        if not os.getenv('OPENAI_API_KEY'):
            raise ValueError("OPENAI_API_KEY not set")

    def complete_json(self, prompt, user_text, schema, context=""):
        from openai import OpenAI  # optional dependency: pip install openai
        client = OpenAI()
        full = (f"{user_text}\n\n" if user_text else "") + prompt + "\n\nReturn ONLY a valid JSON object."
        r = client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You return only valid JSON matching the requested structure."},
                {"role": "user", "content": full},
            ],
        )
        return _coerce(_extract_json(r.choices[0].message.content), schema)

    def complete_json_from_video(self, *a, **k):
        raise ValueError(_VIDEO_UNSUPPORTED)


class AnthropicProvider:
    """Anthropic Claude (bring your own key), via the official anthropic SDK. No video support."""
    supports_video = False

    def __init__(self):
        # Default per the Claude API skill; override with ANTHROPIC_MODEL
        # (e.g. claude-haiku-4-5 for the cheapest option on this extraction task).
        self.model = os.getenv('ANTHROPIC_MODEL', 'claude-opus-4-8')
        if not os.getenv('ANTHROPIC_API_KEY'):
            raise ValueError("ANTHROPIC_API_KEY not set")

    def complete_json(self, prompt, user_text, schema, context=""):
        from anthropic import Anthropic  # optional dependency: pip install anthropic
        client = Anthropic()
        full = (f"{user_text}\n\n" if user_text else "") + prompt + \
            "\n\nReturn ONLY valid JSON matching the structure described above. No prose, no markdown."
        resp = client.messages.create(
            model=self.model,
            max_tokens=8192,
            messages=[{"role": "user", "content": full}],
        )
        text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text")
        return _coerce(_extract_json(text), schema)

    def complete_json_from_video(self, *a, **k):
        raise ValueError(_VIDEO_UNSUPPORTED)


_PROVIDERS = {
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}


def get_provider():
    """Instantiate the provider named by LLM_PROVIDER (default: gemini)."""
    name = (os.getenv("LLM_PROVIDER") or "gemini").strip().lower()
    cls = _PROVIDERS.get(name)
    if cls is None:
        raise ValueError(f"Unknown LLM_PROVIDER '{name}'. Options: {', '.join(_PROVIDERS)}")
    return cls()
