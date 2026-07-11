import logging

from app.config import LLM_PROVIDER
from .adapter import LlmClient

logger = logging.getLogger(__name__)


def get_llm() -> LlmClient:
    logger.info("LLM provider: %s", LLM_PROVIDER)
    if LLM_PROVIDER == "gemini":
        from .gemini_client import GeminiClient
        return GeminiClient()
    if LLM_PROVIDER == "openai":
        from .openai_client import OpenAIClient
        return OpenAIClient()
    raise ValueError(f"Unsupported LLM provider: {LLM_PROVIDER}")
