import logging
from typing import Any

from ..config import Config
from .base import BaseLLMProvider
from .openai_compat import OpenAICompatProvider
from .gemini_account import GeminiAccountProvider
from .chatgpt_account import ChatGPTAccountProvider

logger = logging.getLogger("x_digest.llm.factory")


def get_llm_provider(
    provider: str | None = None,
    auth_mode: str | None = None,
    model: str | None = None,
) -> BaseLLMProvider:
    """
    Factory function resolving and returning the appropriate LLM provider
    based on requested or configured provider and authentication mode.
    """
    prov = (provider or Config.LLM_PROVIDER or "gemini").lower().strip()
    mode = (auth_mode or Config.LLM_AUTH_MODE or "account").lower().strip()
    target_model = model or Config.LLM_MODEL or None

    if mode == "account":
        if prov in ("gemini", "google"):
            return GeminiAccountProvider(model_name=target_model)
        elif prov in ("openai", "chatgpt", "gpt"):
            return ChatGPTAccountProvider(model_name=target_model)
        else:
            raise ValueError(
                f"厂商 '{prov}' 暂不支持账号订阅认证模式（仅支持 gemini 与 openai）。\n"
                f"请配置 --auth-mode api_key 并在 .env 设置相应 API Key。"
            )

    # API-Key mode
    if prov in ("gemini", "google"):
        return OpenAICompatProvider(provider="gemini_api", model_name=target_model)
    elif prov in ("openai", "gpt", "deepseek", "qwen", "glm", "zhipu", "minimax", "kimi", "custom"):
        return OpenAICompatProvider(provider=prov, model_name=target_model)
    else:
        # Fallback to custom OpenAI compatible provider
        logger.warning(f"Unknown provider '{prov}', falling back to custom OpenAI-compatible endpoint.")
        return OpenAICompatProvider(provider="custom", model_name=target_model)
