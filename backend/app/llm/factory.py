import logging

from app.config import IS_PRODUCTION, LLM_PROVIDER
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
    if LLM_PROVIDER == "fake":
        # Scripted replies for tests and end-to-end runs; never on a real
        # deploy, where it would silently answer every user the same way.
        if IS_PRODUCTION:
            raise ValueError("The fake LLM provider is not allowed in production")
        from .fake import FakeLlm
        return FakeLlm()
    raise ValueError(f"Unsupported LLM provider: {LLM_PROVIDER}")
