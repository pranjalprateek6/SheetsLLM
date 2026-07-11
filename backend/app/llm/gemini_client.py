import logging

from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, GEMINI_MODEL, LLM_PROVIDER
from .adapter import LlmClient, LlmError

logger = logging.getLogger(__name__)

_GEMINI_CLIENT = None


def _get_gemini_client():
    global _GEMINI_CLIENT
    if _GEMINI_CLIENT is None:
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set")
        _GEMINI_CLIENT = genai.Client(api_key=GEMINI_API_KEY)
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
        try:
            result = self.client.models.generate_content(
                model=self.model_name,
                contents=[user_message],
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0,
                ),
            )
            content = result.text or ""
            return content.strip()
        except Exception as exc:
            raise LlmError(f"Gemini request failed: {exc}") from exc
