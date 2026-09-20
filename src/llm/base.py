from abc import ABC, abstractmethod
from typing import Any


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers (API-key based or Account-based).
    """

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or self.default_model

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Default model name when not specified."""
        pass

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Readable name of the provider."""
        pass

    @abstractmethod
    def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        """Synchronously or internally executes text generation."""
        pass
