from fastapi import APIRouter

from app.config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)

router = APIRouter()


@router.get("/health")
def health():
    if LLM_PROVIDER == "gemini":
        model, has_key = GEMINI_MODEL, bool(GEMINI_API_KEY)
    else:
        model, has_key = OPENAI_MODEL, bool(OPENAI_API_KEY)
    return {
        "ok": True,
        "provider": LLM_PROVIDER,
        "model": model,
        "has_key": has_key,
    }
