import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright, BrowserContext, Page, Response
from rich.console import Console
from .config import Config

logger = logging.getLogger(__name__)
console = Console()


def parse_tweet_result(tweet_result: dict[str, Any]) -> dict[str, Any] | None:
    """Extracts clean tweet dictionary from a tweet_results GraphQL node."""
    if not tweet_result:
        return None

    # Handle TweetWithVisibilityResults wrapper
    if tweet_result.get("__typename") == "TweetWithVisibilityResults":
        tweet_result = tweet_result.get("tweet", {})

    legacy = tweet_result.get("legacy")
    if not legacy:
        return None

    # Author info
    user_results = tweet_result.get("core", {}).get("user_results", {}).get("result", {})
    user_legacy = user_results.get("legacy", {})
    author_id = user_results.get("rest_id", "")
    author_name = user_legacy.get("name", "")
    author_username = user_legacy.get("screen_name", "")

    # Check for long-form note tweet (X Articles / Long Tweets)
    note_tweet = tweet_result.get("note_tweet", {}).get("note_tweet_results", {}).get("result", {})
    full_text = note_tweet.get("text") or legacy.get("full_text", "")

    # Retweet info
    is_retweet = "retweeted_status_result" in legacy
    retweeted_author = ""
    retweeted_text = ""
    if is_retweet:
        rt_result = legacy.get("retweeted_status_result", {}).get("result", {})
        if rt_result.get("__typename") == "TweetWithVisibilityResults":
            rt_result = rt_result.get("tweet", {})
        rt_legacy = rt_result.get("legacy", {})
        rt_user = rt_result.get("core", {}).get("user_results", {}).get("result", {}).get("legacy", {})
        retweeted_author = rt_user.get("screen_name", "")
        retweeted_text = rt_legacy.get("full_text", "")

    # Quote info
    is_quote = legacy.get("is_quote_status", False)
    quoted_author = ""
    quoted_text = ""
    if is_quote and "quoted_status_result" in tweet_result:
        q_result = tweet_result.get("quoted_status_result", {}).get("result", {})
        if q_result.get("__typename") == "TweetWithVisibilityResults":
            q_result = q_result.get("tweet", {})
        q_legacy = q_result.get("legacy", {})
        q_user = q_result.get("core", {}).get("user_results", {}).get("result", {}).get("legacy", {})
        quoted_author = q_user.get("screen_name", "")
        quoted_text = q_legacy.get("full_text", "")

    # Media & URLs
    media_urls = []
    entities = legacy.get("entities", {})
    for m in entities.get("media", []):
        if "media_url_https" in m:
            media_urls.append(m["media_url_https"])

    urls = []
    for u in entities.get("urls", []):
        expanded = u.get("expanded_url")
        if expanded:
            urls.append(expanded)

    return {
        "tweet_id": str(tweet_result.get("rest_id", "")),
        "author_id": str(author_id),
        "author_name": author_name,
        "author_username": author_username,
        "text": full_text,
        "created_at": legacy.get("created_at", ""),
        "is_retweet": is_retweet,
        "retweeted_author": retweeted_author,
        "retweeted_text": retweeted_text,
        "is_quote": is_quote,
        "quoted_author": quoted_author,
        "quoted_text": quoted_text,
        "like_count": legacy.get("favorite_count", 0),
        "retweet_count": legacy.get("retweet_count", 0),
        "reply_count": legacy.get("reply_count", 0),
        "view_count": int(tweet_result.get("views", {}).get("count", 0) or 0),
        "urls": urls,
        "media_urls": media_urls,
    }


def parse_timeline_instructions(instructions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extracts tweets from timeline GraphQL instructions entries."""
    parsed_tweets = []
    for instruction in instructions:
        type_ = instruction.get("type")
        entries = []
        if type_ == "TimelineAddEntries":
            entries = instruction.get("entries", [])
        elif type_ == "TimelineAddToModule":
            entries = instruction.get("moduleItems", [])

        for entry in entries:
            content = entry.get("content", {})
            item_content = content.get("itemContent", {})
            tweet_results = item_content.get("tweet_results", {}).get("result")
            if tweet_results:
                tweet_data = parse_tweet_result(tweet_results)
                if tweet_data and tweet_data["tweet_id"]:
                    parsed_tweets.append(tweet_data)

            # Handle threads / items nested in modules
            items = content.get("items", [])
            for sub_item in items:
                sub_ic = sub_item.get("item", {}).get("itemContent", {})
                sub_tr = sub_ic.get("tweet_results", {}).get("result")
                if sub_tr:
                    sub_data = parse_tweet_result(sub_tr)
                    if sub_data and sub_data["tweet_id"]:
                        parsed_tweets.append(sub_data)
    return parsed_tweets


class XClient:
    def __init__(self, timeout: int | None = None) -> None:
        self.timeout_seconds = timeout or Config.FETCH_TIMEOUT
        self.timeout_ms = self.timeout_seconds * 1000
        self.proxy_dict = None
    async def _launch_browser(self, p: Any, headless: bool = True) -> Any:
        args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars",
        ]
        try:
            # Prefer actual Google Chrome installation for authentic fingerprint
            return await p.chromium.launch(
                channel="chrome",
                headless=headless,
                proxy=self.proxy_dict,
                args=args,
            )
        except Exception:
            return await p.chromium.launch(
                headless=headless,
                proxy=self.proxy_dict,
                args=args,
            )

    async def _setup_context(self, browser: Any, timeout_ms: int | None = None) -> BrowserContext:
        """Sets up browser context with cookies, timeouts, or storage state."""
        effective_timeout_ms = timeout_ms or self.timeout_ms
        context_kwargs: dict[str, Any] = {
            "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "viewport": {"width": 1280, "height": 900},
            "locale": "zh-CN",
            "timezone_id": "Asia/Shanghai",
        }

        if Config.AUTH_STATE_PATH.exists():
            context_kwargs["storage_state"] = str(Config.AUTH_STATE_PATH)
            context = await browser.new_context(**context_kwargs)
        else:
            context = await browser.new_context(**context_kwargs)
            if Config.X_AUTH_TOKEN:
                cookies = [
                    {"name": "auth_token", "value": Config.X_AUTH_TOKEN, "domain": ".x.com", "path": "/"},
                ]
                if Config.X_CT0:
                    cookies.append({"name": "ct0", "value": Config.X_CT0, "domain": ".x.com", "path": "/"})
                await context.add_cookies(cookies)

        # Remove navigator.webdriver automation flag
        await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
        context.set_default_navigation_timeout(effective_timeout_ms)
        context.set_default_timeout(effective_timeout_ms)
        return context

    async def login_interactive(self, timeout: int | None = None) -> None:
        """Opens a visible browser window for the user to log in and saves auth_state.json."""
        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        console.print(f"[bold cyan]🚀 正在启动真实 Chrome 浏览器（超时阈值: {timeout_s} 秒），请在窗口中登录 X...[/bold cyan]")
        Config.ensure_dirs()

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=False)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()

            try:
                # Use commit wait_until so page displays immediately even on slow proxy networks
                await page.goto("https://x.com/login", wait_until="commit", timeout=timeout_ms)
            except Exception as e:
                console.print(f"[yellow]⚠️ 页面加载较慢或有重试: {e}，窗口已打开，可直接在浏览器中操作...[/yellow]")

            console.print("[yellow]⏳ 请在浏览器窗口中完成登录。检测到成功跳转至首页后将自动保存凭证并退出...[/yellow]")

            # Wait until user reaches /home or auth_token cookie is created (up to 5 minutes)
            for _ in range(300):
                await asyncio.sleep(1)
                try:
                    current_url = page.url
                    if "x.com/home" in current_url:
                        await asyncio.sleep(2)  # Wait for session cookies to flush
                        await context.storage_state(path=str(Config.AUTH_STATE_PATH))
                        console.print(f"[bold green]🎉 登录成功！会话凭证已持久化至: {Config.AUTH_STATE_PATH}[/bold green]")
                        await browser.close()
                        return
                except Exception:
                    # In case page is navigating or closed
                    pass

            await browser.close()
            raise TimeoutError("登录超时（5分钟未完成登录）。")

    async def verify_auth(self, timeout: int | None = None) -> dict[str, str]:
        """Verifies authentication status in headless mode."""
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 中填写 X_AUTH_TOKEN，或运行 python main.py --login 登录。")

        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()

            try:
                await page.goto("https://x.com/home", wait_until="commit", timeout=timeout_ms)
                await page.wait_for_timeout(3000)
                current_url = page.url

                if "login" in current_url or "i/flow" in current_url:
                    raise RuntimeError("会话失效（被重定向至登录页）。请重新配置 auth_token 或执行 python main.py --login。")

                cookies = await context.cookies()
                cookie_names = {c["name"] for c in cookies}
                if "auth_token" not in cookie_names:
                    raise RuntimeError("未检测到有效 auth_token Cookie。")

                # Try to get screen name from page or return success
                title = await page.title()
                return {
                    "id": "Authenticated",
                    "name": title.replace("/ X", "").strip() or "X User",
                    "screen_name": "logged_in",
                }
            finally:
                await browser.close()

    async def fetch_following_timeline(
        self,
        max_pages: int = 3,
        page_delay: float = 2.5,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Intercepts real GraphQL responses for HomeLatestTimeline via headless Playwright.
        """
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 填写 X_AUTH_TOKEN 或运行 python main.py --login。")

        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        captured_raw_instructions: list[list[dict[str, Any]]] = []

        async def handle_response(response: Response) -> None:
            url = response.url
            if ("HomeLatestTimeline" in url or "HomeTimeline" in url) and response.status == 200:
                try:
                    data = await response.json()
                    instructions = (
                        data.get("data", {})
                        .get("home", {})
                        .get("home_timeline_urt", {})
                        .get("instructions", [])
                    )
                    if instructions:
                        captured_raw_instructions.append(instructions)
                except Exception as e:
                    logger.debug(f"Failed to parse intercepted response: {e}")

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()
            page.on("response", handle_response)

            console.print(f"[cyan]🌐 正在无头打开 x.com/home 并挂载网络监听器（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto("https://x.com/home", wait_until="commit", timeout=timeout_ms)
            await page.wait_for_timeout(3000)

            # Check if redirected to login
            if "login" in page.url or "i/flow" in page.url:
                await browser.close()
                raise RuntimeError("X 认证失败：页面被重定向至登录页。请检查 auth_token 是否过期。")

            # Click "Following" tab to ensure we are receiving Following timeline
            try:
                following_tab = page.locator("a[role='tab']", has_text=re.compile(r"Following|正在关注|关注", re.I)).first
                if await following_tab.is_visible(timeout=3000):
                    await following_tab.click()
                    await page.wait_for_timeout(2000)
            except Exception as e:
                logger.debug(f"Could not click following tab directly: {e}")

            # Scroll down to trigger pagination and collect more pages
            for page_idx in range(1, max_pages):
                console.print(f"[cyan]📜 正在向下滚动加载第 {page_idx + 1} 页推文...[/cyan]")
                await page.evaluate("window.scrollBy(0, 1800)")
                await page.wait_for_timeout(int(page_delay * 1000))

            await browser.close()

        # Parse all captured instructions
        all_tweets: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for inst_list in captured_raw_instructions:
            batch_tweets = parse_timeline_instructions(inst_list)
            for t in batch_tweets:
                if t["tweet_id"] not in seen_ids:
                    seen_ids.add(t["tweet_id"])
                    all_tweets.append(t)

        return all_tweets
