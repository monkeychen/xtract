import json
import logging
from typing import Any
import httpx

from ..config import Config
from .base import BaseLLMProvider

logger = logging.getLogger("x_digest.llm.openai_compat")

PROVIDER_CONFIGS = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
    },
    "gpt": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-flash",
        "env_key": "DEEPSEEK_API_KEY",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-plus",
        "env_key": "DASHSCOPE_API_KEY",
    },
    "qwen_token_plan": {
        "base_url": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-plus",
        "env_key": "DASHSCOPE_API_KEY",
    },
    "glm": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-plus",
        "env_key": "ZHIPUAI_API_KEY",
    },
    "glm_code_plan": {
        "base_url": "https://open.bigmodel.cn/api/coding/paas/v4",
        "default_model": "glm-4-plus",
        "env_key": "ZHIPUAI_API_KEY",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-plus",
        "env_key": "ZHIPUAI_API_KEY",
    },
    "zhipu_code_plan": {
        "base_url": "https://open.bigmodel.cn/api/coding/paas/v4",
        "default_model": "glm-4-plus",
        "env_key": "ZHIPUAI_API_KEY",
    },
    "minimax": {
        "base_url": "https://api.minimax.chat/v1",
        "default_model": "MiniMax-M3",
        "env_key": "MINIMAX_API_KEY",
    },
    "kimi": {
        "base_url": "https://api.moonshot.cn/v1",
        "default_model": "kimi-k3",
        "env_key": "MOONSHOT_API_KEY",
    },
    "gemini_api": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default_model": "gemini-3.8-flash",
        "env_key": "GEMINI_API_KEY",
    },
    "custom": {
        "base_url": "",
        "default_model": "gpt-4o",
        "env_key": "OPENAI_API_KEY",
    }
}


class OpenAICompatProvider(BaseLLMProvider):
    """
    Unified client for OpenAI-compatible REST endpoints:
    OpenAI, DeepSeek, Qwen (DashScope / Token Plan), Zhipu GLM (Standard / Code Plan), MiniMax, Kimi, etc.
    """

    def __init__(
        self,
        provider: str = "openai",
        api_key: str | None = None,
        base_url: str | None = None,
        model_name: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self._provider = provider.lower().replace("-", "_")
        cfg = PROVIDER_CONFIGS.get(self._provider, PROVIDER_CONFIGS["custom"])

        self._api_key = api_key or getattr(Config, cfg["env_key"], "")

        # Dynamic endpoint resolution with intelligent auto-deduction
        resolved_base_url = base_url
        if not resolved_base_url:
            if "qwen" in self._provider:
                if Config.DASHSCOPE_BASE_URL:
                    resolved_base_url = Config.DASHSCOPE_BASE_URL
                elif self._provider == "qwen_token_plan" or (self._api_key and self._api_key.startswith("sk-sp-")):
                    # Auto-detect Alibaba Model Studio Token Plan dedicated key (sk-sp-)
                    resolved_base_url = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
                else:
                    resolved_base_url = cfg["base_url"]
            elif "glm" in self._provider or "zhipu" in self._provider:
                if Config.ZHIPUAI_BASE_URL:
                    resolved_base_url = Config.ZHIPUAI_BASE_URL
                elif self._provider in ("glm_code_plan", "zhipu_code_plan", "glm_coding", "zhipu_coding"):
                    # Dedicated GLM Coding Plan endpoint
                    resolved_base_url = "https://open.bigmodel.cn/api/coding/paas/v4"
                else:
                    resolved_base_url = cfg["base_url"]
            elif "kimi" in self._provider:
                resolved_base_url = Config.MOONSHOT_BASE_URL or cfg["base_url"]
            elif "deepseek" in self._provider:
                resolved_base_url = Config.DEEPSEEK_BASE_URL or cfg["base_url"]
            elif "minimax" in self._provider:
                resolved_base_url = Config.MINIMAX_BASE_URL or cfg["base_url"]
            elif self._provider in ("openai", "gpt"):
                resolved_base_url = Config.OPENAI_BASE_URL or cfg["base_url"]
            else:
                resolved_base_url = Config.OPENAI_BASE_URL or cfg["base_url"]

        self._base_url = resolved_base_url.rstrip("/")
        self._default_model = cfg["default_model"]
        self._timeout = timeout

        super().__init__(model_name=model_name or Config.LLM_MODEL)

    @property
    def default_model(self) -> str:
        return self._default_model

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def provider_name(self) -> str:
        if self._provider == "qwen_token_plan" or "token-plan" in self._base_url:
            return "Qwen (Token Plan · 专属套餐)"
        if self._provider in ("glm_code_plan", "zhipu_code_plan") or "/coding/" in self._base_url:
            return "GLM (Coding Plan · 专属套餐)"
        return f"{self._provider.capitalize()} (API Key)"

    def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        if not self._api_key:
            raise ValueError(f"调用 {self.provider_name} 失败：未配置 API Key。请在 .env 中设置相应密钥。")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        endpoint = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0.3,
        }

        proxies = Config.HTTP_PROXY if Config.HTTP_PROXY and any(p in self._provider for p in ["openai", "gemini"]) else None

        with httpx.Client(timeout=self._timeout, proxy=proxies) as client:
            response = client.post(endpoint, headers=headers, json=payload)
            if response.status_code != 200:
                raise RuntimeError(
                    f"LLM API 请求失败 [{response.status_code}]: {response.text[:300]}"
                )

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                raise RuntimeError(f"LLM 未返回有效内容: {data}")

            return choices[0].get("message", {}).get("content", "")
