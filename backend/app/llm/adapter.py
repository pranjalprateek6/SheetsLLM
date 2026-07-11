from abc import ABC, abstractmethod


class LlmError(Exception):
    """Base error for LLM failures."""
    pass


class LlmClient(ABC):
    @abstractmethod
    def generate_sql(self, system_prompt: str, user_message: str) -> str:
        """
        Send system + user messages to the LLM.
        Returns the raw text response (expected to be a SQL SELECT statement).
        """
        ...
