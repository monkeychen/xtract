import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright
from rich.console import Console

from .config import Config

logger = logging.getLogger("x_digest.auth")
console = Console()


class AuthManager:
    """
    Manages interactive browser logins and automatic session credential capture
    for X, OpenAI (ChatGPT Plus/Team), and Google Gemini.
    """

    def __init__(self, timeout_seconds: int = 120) -> None:
        self.timeout_seconds = timeout_seconds
        self.proxy_dict = {"server": Config.HTTP_PROXY} if Config.HTTP_PROXY else None

    async def _launch_visible_browser(self, p: Any) -> Any:
        args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars",
        ]
        try:
            return await p.chromium.launch(
                channel="chrome",
                headless=False,
                proxy=self.proxy_dict,
                args=args,
            )
        except Exception:
            return await p.chromium.launch(
                headless=False,
                proxy=self.proxy_dict,
                args=args,
            )

    async def login_x(self, timeout: int | None = None) -> None:
        """Opens a visible browser window for the user to log into X and saves auth_state.json."""
        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        Config.ensure_dirs()

        console.print(f"[bold cyan]🚀 正在启动真实 Chrome 浏览器（超时阈值: {timeout_s} 秒），请在窗口中登录 X...[/bold cyan]")

        async with async_playwright() as p:
            browser = await self._launch_visible_browser(p)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                locale="zh-CN",
            )
            page = await context.new_page()

            try:
                await page.goto("https://x.com/login", wait_until="commit", timeout=timeout_ms)
            except Exception as e:
                console.print(f"[yellow]⚠️ 页面加载中: {e}，窗口已打开，可直接在浏览器中操作...[/yellow]")

            console.print("[yellow]⏳ 请在浏览器窗口中完成登录。检测到进入首页后将自动提取会话并退出...[/yellow]")

            for _ in range(max(300, timeout_s)):
                await asyncio.sleep(1)
                try:
                    if "x.com/home" in page.url:
                        await asyncio.sleep(2)
                        await context.storage_state(path=str(Config.AUTH_STATE_PATH))
                        console.print(f"[bold green]🎉 X 登录成功！会话凭证已持久化至: {Config.AUTH_STATE_PATH}[/bold green]")
                        await browser.close()
                        return
                except Exception:
                    pass

            await browser.close()
            raise TimeoutError("登录超时，未检测到成功进入 X 首页。")

    async def login_openai(self, timeout: int | None = None) -> None:
        """
        Opens a visible browser window for ChatGPT login.
        Automatically intercepts and saves the official session JWT accessToken to chatgpt_auth.json.
        """
        timeout_s = timeout or max(180, self.timeout_seconds)
        timeout_ms = timeout_s * 1000
        Config.ensure_dirs()

        console.print(f"[bold cyan]🚀 正在调起 Chrome 窗口打开 ChatGPT 登录页（超时阈值: {timeout_s} 秒）...[/bold cyan]")
        console.print("[dim]提示：支持 Google / Apple / 邮箱快捷登录。登录成功后系统会自动捕获凭证，无需手动查找。[/dim]")

        async with async_playwright() as p:
            browser = await self._launch_visible_browser(p)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                locale="zh-CN",
            )
            page = await context.new_page()

            try:
                await page.goto("https://chatgpt.com/auth/login", wait_until="commit", timeout=timeout_ms)
            except Exception as e:
                console.print(f"[yellow]⚠️ 页面加载中: {e}，请直接在窗口中进行登录...[/yellow]")

            console.print("[yellow]⏳ 等待登录完成...检测到进入主聊天界面后将自动提取会话授权...[/yellow]")

            captured_session = None
            for _ in range(timeout_s):
                await asyncio.sleep(1)
                try:
                    current_url = page.url
                    # User reached main chatgpt page
                    if "chatgpt.com" in current_url and not any(k in current_url for k in ["/auth/", "/login", "/signup"]):
                        # Try evaluating /api/auth/session directly in browser context
                        session_data = await page.evaluate("""
                            async () => {
                                try {
                                    const res = await fetch('/api/auth/session');
                                    if (res.ok) {
                                        return await res.json();
                                    }
                                } catch (e) {}
                                return null;
                            }
                        """)

                        if session_data and session_data.get("accessToken"):
                            captured_session = session_data
                            break
                except Exception:
                    pass

            if not captured_session:
                await browser.close()
                raise TimeoutError("登录超时或未成功截获 ChatGPT 会话凭证。")

            # Also grab cookies for potential session refreshes
            cookies = await context.cookies()
            auth_payload = {
                "access_token": captured_session.get("accessToken"),
                "user": captured_session.get("user", {}),
                "expires": captured_session.get("expires"),
                "auth_provider": captured_session.get("authProvider"),
                "cookies": cookies,
                "saved_at": datetime.now(timezone.utc).isoformat(),
            }

            with open(Config.CHATGPT_AUTH_PATH, "w", encoding="utf-8") as f:
                json.dump(auth_payload, f, indent=2, ensure_ascii=False)

            console.print(f"[bold green]🎉 OpenAI (ChatGPT) 账号授权成功！[/bold green]")
            user_email = captured_session.get("user", {}).get("email") or "已登录用户"
            console.print(f"[green]✓ 当前账号: {user_email} (会话已保存至 {Config.CHATGPT_AUTH_PATH})[/green]")
            console.print("[cyan]后续生成早报与趋势研报将直接消耗该账号订阅配额，零 API Key 扣费。[/cyan]")

            await browser.close()

    async def login_gemini(self, timeout: int | None = None) -> None:
        """
        Verifies and initializes Google Gemini account authentication.
        Checks for local agy CLI / Google session, or opens Google login.
        """
        Config.ensure_dirs()
        console.print("[bold cyan]🔍 正在检测本地 Google Gemini 账号认证环境...[/bold cyan]")

        # Check if agy CLI is available and authenticated
        try:
            proc = await asyncio.create_subprocess_exec(
                "agy", "-p", "ping", "--output-format", "text",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if proc.returncode == 0:
                auth_payload = {
                    "provider": "gemini",
                    "channel": "agy_cli",
                    "status": "authenticated",
                    "saved_at": datetime.now(timezone.utc).isoformat(),
                }
                with open(Config.GEMINI_AUTH_PATH, "w", encoding="utf-8") as f:
                    json.dump(auth_payload, f, indent=2, ensure_ascii=False)

                console.print(f"[bold green]🎉 检测到本地已登录有效的 Google 账号通道 (Antigravity agy)！[/bold green]")
                console.print(f"[green]✓ 会话凭证已确认并记录于: {Config.GEMINI_AUTH_PATH}[/green]")
                console.print("[cyan]生成报告将直接复用该通道，消耗 Google 账号订阅配额。[/cyan]")
                return
        except Exception as e:
            logger.debug(f"agy check failed: {e}")

        # Fallback to interactive Google login
        console.print("[yellow]正在启动 Chrome 窗口进行 Google 账号交互式登录...[/yellow]")
        async with async_playwright() as p:
            browser = await self._launch_visible_browser(p)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                locale="zh-CN",
            )
            page = await context.new_page()
            await page.goto("https://gemini.google.com/app", wait_until="commit")

            for _ in range(timeout or 120):
                await asyncio.sleep(1)
                if "gemini.google.com/app" in page.url and "login" not in page.url:
                    await context.storage_state(path=str(Config.GEMINI_AUTH_PATH))
                    console.print(f"[bold green]🎉 Gemini 账号登录成功！凭据已保存至: {Config.GEMINI_AUTH_PATH}[/bold green]")
                    await browser.close()
                    return

            await browser.close()
            raise TimeoutError("Gemini 登录超时。")


async def run_interactive_login(service: str = "x", timeout: int | None = None) -> None:
    manager = AuthManager()
    svc = service.lower().strip()
    if svc in ("x", "twitter"):
        await manager.login_x(timeout=timeout)
    elif svc in ("openai", "chatgpt", "gpt"):
        await manager.login_openai(timeout=timeout)
    elif svc in ("gemini", "google"):
        await manager.login_gemini(timeout=timeout)
    else:
        console.print(f"[bold red]❌ 未知登录服务: '{service}'。支持的服务: x | openai | gemini[/bold red]")
