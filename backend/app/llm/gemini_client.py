import logging

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, GEMINI_MODEL, LLM_PROVIDER
from .adapter import LlmClient, LlmError, call_with_retry

logger = logging.getLogger(__name__)

_GEMINI_CLIENT = None


def _get_gemini_client():
    global _GEMINI_CLIENT
    if _GEMINI_CLIENT is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set")
        _GEMINI_CLIENT = genai.Client(
            api_key=GEMINI_API_KEY,
            # Without an explicit timeout the SDK can hang indefinitely on a
            # stalled connection and pin its worker thread forever (value ms).
            # 40s keeps two attempts (40 + 2s backoff + 40) inside the 90s
            # /chat and /transform route budgets in main.py.
            http_options=types.HttpOptions(timeout=40_000),
        )
    return _GEMINI_CLIENT


class GeminiClient(LlmClient):
    def __init__(self) -> None:
        if LLM_PROVIDER != "gemini":
            raise RuntimeError(
                f"LLM_PROVIDER must be 'gemini' for Gemini client, got: {LLM_PROVIDER}"
            )
        self.client = _get_gemini_client()
        self.model_name = GEMINI_MODEL

    def generate_sql(self, system_prompt: str, user_message: str) -> str:
        def _call() -> str:
            result = self.client.models.generate_content(
                model=self.model_name,
                contents=[user_message],
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0,
                ),
            )
            return (result.text or "").strip()

        try:
            return call_with_retry(_call)
        except Exception as exc:
            raise LlmError(f"Gemini request failed: {exc}") from exc
