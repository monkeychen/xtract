import json
import logging
from typing import Any
import httpx

from ..config import Config
from .base import BaseLLMProvider

logger = logging.getLogger("x_digest.llm.chatgpt_account")


class ChatGPTAccountProvider(BaseLLMProvider):
    """
    Invokes OpenAI ChatGPT using session credentials captured via `python main.py --login openai`.
    Consumes user's ChatGPT Plus / Team web quota without API Key costs.
    """

    def __init__(self, model_name: str | None = None, timeout: float = 120.0) -> None:
        self._timeout = timeout
        super().__init__(model_name=model_name or "gpt-5.6-sol")

    @property
    def default_model(self) -> str:
        return "gpt-5.6-sol"

    @property
    def provider_name(self) -> str:
        return "OpenAI ChatGPT (Account Mode · 网页订阅配额)"

    def _load_credentials(self) -> dict[str, Any]:
        if not Config.CHATGPT_AUTH_PATH.exists():
            raise RuntimeError(
                "未检测到已登录的 OpenAI (ChatGPT) 账号凭据。\n"
                "👉 请先执行以下命令在弹出窗口中登录 ChatGPT：\n"
                "   uv run python main.py --login openai\n"
                "登录后系统将自动保存凭证并可直接使用订阅配额。"
            )

        with open(Config.CHATGPT_AUTH_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        images: list[str] | None = None,
    ) -> str:
        creds = self._load_credentials()
        access_token = creds.get("access_token")
        if not access_token:
            raise RuntimeError("ChatGPT 授权凭证中缺少 access_token，请重新执行 `uv run python main.py --login openai`。")

        # Fallback to standard OpenAI API if key is present and token expired
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # OpenAI backend conversation / completions bridge
        # Standard backend-api conversation payload structure or gateway
        proxies = Config.HTTP_PROXY if Config.HTTP_PROXY else None

        # Attempt ChatGPT backend conversation or standard endpoint with accessToken
        endpoint = "https://chatgpt.com/backend-api/conversation"
        payload = {
            "action": "next",
            "messages": [
                {
                    "id": "aaa111",
                    "author": {"role": "user"},
                    "content": {"content_type": "text", "parts": [f"{system_prompt}\n\n---\n\n{prompt}" if system_prompt else prompt]},
                }
            ],
            "model": "auto",
            "parent_message_id": "bbb222",
        }

        try:
            with httpx.Client(timeout=self._timeout, proxy=proxies) as client:
                res = client.post(endpoint, headers=headers, json=payload)
                if res.status_code == 200:
                    # Parse SSE stream from backend-api
                    lines = res.text.split("\n")
                    last_text = ""
                    for line in lines:
                        if line.startswith("data: ") and not line.startswith("data: [DONE]"):
                            try:
                                chunk = json.loads(line[6:])
                                parts = chunk.get("message", {}).get("content", {}).get("parts", [])
                                if parts:
                                    last_text = parts[0]
                            except Exception:
                                pass
                    if last_text:
                        return last_text
        except Exception as e:
            logger.debug(f"Direct backend conversation failed: {e}")

        # Fallback: If OPENAI_API_KEY is available, fallback to API
        if Config.OPENAI_API_KEY:
            from .openai_compat import OpenAICompatProvider
            api_provider = OpenAICompatProvider(provider="openai", model_name=self.model_name)
            return api_provider.generate(prompt=prompt, system_prompt=system_prompt, images=images)

        raise RuntimeError(
            "ChatGPT 账号接口请求未成功响应（可能会话过期）。\n"
            "👉 请重新执行 `uv run python main.py --login openai` 刷新会话凭证。"
        )
