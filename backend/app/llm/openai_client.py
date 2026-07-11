import logging

import httpx

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from .adapter import LlmClient, LlmError

logger = logging.getLogger(__name__)


class OpenAIClient(LlmClient):
    def __init__(self) -> None:
        self.api_key = OPENAI_API_KEY
        self.model = OPENAI_MODEL

    def generate_sql(self, system_prompt: str, user_message: str) -> str:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY not set")

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.0,
        }

        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            raise LlmError(
                f"OpenAI request failed: {exc.response.status_code} {exc.response.text}"
            ) from exc
        except httpx.HTTPError as exc:
            raise LlmError(f"OpenAI transport error: {exc}") from exc

        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError) as exc:
            logger.warning("Unexpected OpenAI response structure")
            raise LlmError("Failed to extract response from OpenAI") from exc
