import logging
import subprocess
from typing import Any
from rich.console import Console

from ..config import Config
from .base import BaseLLMProvider

logger = logging.getLogger("x_digest.llm.gemini_account")
console = Console()


class GeminiAccountProvider(BaseLLMProvider):
    """
    Invokes Google Gemini using active Google Account / Antigravity CLI session.
    Consumes user's Google subscription quota without incurring API Key costs.
    """

    def __init__(self, model_name: str | None = None, timeout: int = 180) -> None:
        self._timeout = timeout
        super().__init__(model_name=model_name or "gemini-3.7-flash-high")

    @property
    def default_model(self) -> str:
        return "gemini-3.7-flash-high"

    @property
    def provider_name(self) -> str:
        return "Google Gemini (Account Mode · 订阅配额)"

    def generate(self, prompt: str, system_prompt: str | None = None) -> str:
        full_prompt = f"{system_prompt}\n\n---\n\n{prompt}" if system_prompt else prompt

        # 1. Attempt using local agy CLI (Google account channel)
        try:
            cmd = [
                "agy",
                "-p", full_prompt,
                "--model", self.model_name,
                "--output-format", "text",
                "--dangerously-skip-permissions",
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self._timeout,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
            else:
                logger.debug(f"agy execution returned non-zero ({result.returncode}): {result.stderr}")
        except FileNotFoundError:
            logger.debug("agy binary not found on PATH.")
        except Exception as e:
            logger.debug(f"agy execution failed: {e}")

        # 2. Fallback: Google GenAI SDK if API key is provided
        if Config.GEMINI_API_KEY:
            try:
                from google import genai
                client = genai.Client(api_key=Config.GEMINI_API_KEY)
                resp = client.models.generate_content(
                    model=Config.GEMINI_MODEL or "gemini-2.5-flash",
                    contents=[{"role": "user", "parts": [{"text": full_prompt}]}]
                )
                return resp.text or ""
            except Exception as e:
                logger.debug(f"Fallback to google-genai SDK failed: {e}")

        raise RuntimeError(
            "无法使用 Google Gemini 账号认证生成内容：未检测到已登录的本地 Google 账号环境。\n"
            "建议执行 `uv run python main.py --login gemini` 进行登录，或在 .env 中设置 GEMINI_API_KEY。"
        )
