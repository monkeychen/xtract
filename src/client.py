import asyncio
import json
import logging
import re
import urllib.parse
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright, BrowserContext, Page, Response
from rich.console import Console
from .config import Config

logger = logging.getLogger(__name__)
console = Console()


def parse_x_article_to_markdown(article_result: dict[str, Any]) -> tuple[str, list[str]]:
    """
    Parses an X Article Draft.js data structure into a formatted Markdown document,
    extracting all embedded image URLs (including cover image and inline images).
    """
    if not article_result:
        return "", []

    title = (article_result.get("title") or "").strip()
    preview = (article_result.get("preview_text") or "").strip()

    # 1. Cover media
    cover = article_result.get("cover_media", {})
    cover_url = (
        cover.get("media_info", {}).get("original_img_url")
        or cover.get("media_info", {}).get("url")
    )

    # 2. Inline media entities map: media_id -> original_img_url
    media_entities = article_result.get("media_entities", [])
    media_dict: dict[str, str] = {}
    for m in media_entities:
        mid = str(m.get("media_id", ""))
        url = (
            m.get("media_info", {}).get("original_img_url")
            or m.get("media_info", {}).get("url")
        )
        if mid and url:
            media_dict[mid] = url

    all_media_urls: list[str] = []
    if cover_url and cover_url not in all_media_urls:
        all_media_urls.append(cover_url)
    for u in media_dict.values():
        if u not in all_media_urls:
            all_media_urls.append(u)

    # 3. Draft.js content_state parsing
    cs = article_result.get("content_state", {})
    blocks = cs.get("blocks", [])
    entity_map = cs.get("entityMap", {})

    def get_entity(key: Any) -> dict[str, Any] | None:
        if isinstance(entity_map, list):
            try:
                idx = int(key)
                if 0 <= idx < len(entity_map):
                    item = entity_map[idx]
                    return item.get("value", item) if isinstance(item, dict) else None
            except Exception:
                return None
        elif isinstance(entity_map, dict):
            item = entity_map.get(str(key))
            if isinstance(item, dict):
                return item.get("value", item)
        return None

    md_lines: list[str] = []
    if title:
        md_lines.append(f"# {title}\n")
    if cover_url:
        md_lines.append(f"![封面图]({cover_url})\n")

    for b in blocks:
        b_type = b.get("type", "unstyled")
        text = b.get("text", "")

        if b_type == "header-one":
            md_lines.append(f"# {text}\n")
        elif b_type == "header-two":
            md_lines.append(f"## {text}\n")
        elif b_type == "header-three":
            md_lines.append(f"### {text}\n")
        elif b_type == "blockquote":
            quote_text = "\n> ".join(text.splitlines())
            md_lines.append(f"> {quote_text}\n")
        elif b_type == "unordered-list-item":
            md_lines.append(f"- {text}")
        elif b_type == "ordered-list-item":
            md_lines.append(f"1. {text}")
        elif b_type == "atomic":
            for r in b.get("entityRanges", []):
                ent = get_entity(r.get("key"))
                if ent and ent.get("type") == "MEDIA":
                    data = ent.get("data", {})
                    caption = data.get("caption", "").strip()
                    items = data.get("mediaItems", [])
                    for mi in items:
                        mid = str(mi.get("mediaId", ""))
                        img_url = media_dict.get(mid)
                        if img_url:
                            alt = caption or "插图"
                            md_lines.append(f"![{alt}]({img_url})")
                            if caption:
                                md_lines.append(f"*{caption}*\n")
        else:
            # unstyled or other paragraph
            if text.strip():
                md_lines.append(f"{text}\n")

    full_md = "\n".join(md_lines).strip()
    return full_md, all_media_urls


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

    # Author info (Supports both latest user.core and legacy schema)
    user_results = tweet_result.get("core", {}).get("user_results", {}).get("result", {})
    user_core = user_results.get("core", {})
    user_legacy = user_results.get("legacy", {})
    author_id = user_results.get("rest_id", "")
    author_name = user_core.get("name") or user_legacy.get("name", "")
    author_username = user_core.get("screen_name") or user_legacy.get("screen_name", "")

    # Check for long-form note tweet (X Long Tweets)
    note_tweet = tweet_result.get("note_tweet", {}).get("note_tweet_results", {}).get("result", {})
    full_text = note_tweet.get("text") or legacy.get("full_text", "")

    # Check for X Article (Long-form rich-text articles with Draft.js blocks & images)
    article_images: list[str] = []
    article_obj = tweet_result.get("article", {})
    article_res = article_obj.get("article_results", {}).get("result", {})
    if article_res:
        article_md, article_images = parse_x_article_to_markdown(article_res)
        if article_md:
            lead_in = full_text.strip()
            if lead_in:
                full_text = f"{lead_in}\n\n---\n\n{article_md}"
            else:
                full_text = article_md

    # Retweet info
    is_retweet = "retweeted_status_result" in legacy
    retweeted_author = ""
    retweeted_text = ""
    if is_retweet:
        rt_result = legacy.get("retweeted_status_result", {}).get("result", {})
        if rt_result.get("__typename") == "TweetWithVisibilityResults":
            rt_result = rt_result.get("tweet", {})
        rt_legacy = rt_result.get("legacy", {})
        rt_user = rt_result.get("core", {}).get("user_results", {}).get("result", {})
        retweeted_author = rt_user.get("core", {}).get("screen_name") or rt_user.get("legacy", {}).get("screen_name", "")
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
        q_user = q_result.get("core", {}).get("user_results", {}).get("result", {})
        quoted_author = q_user.get("core", {}).get("screen_name") or q_user.get("legacy", {}).get("screen_name", "")
        quoted_text = q_legacy.get("full_text", "")

    # Media & URLs (Supports multiple images and direct MP4 video streams)
    media_urls = []
    media_items = legacy.get("extended_entities", {}).get("media", []) or legacy.get("entities", {}).get("media", [])
    for m in media_items:
        if "media_url_https" in m and m["media_url_https"] not in media_urls:
            media_urls.append(m["media_url_https"])
        if m.get("type") in ("video", "animated_gif"):
            variants = m.get("video_info", {}).get("variants", [])
            mp4_variants = [v for v in variants if v.get("content_type") == "video/mp4"]
            if mp4_variants:
                best_video = max(mp4_variants, key=lambda v: v.get("bitrate", 0))
                if best_video.get("url") and best_video["url"] not in media_urls:
                    media_urls.append(best_video["url"])

    for a_img in article_images:
        if a_img not in media_urls:
            media_urls.append(a_img)

    urls = []
    for u in legacy.get("entities", {}).get("urls", []):
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
    """Extracts tweets from timeline GraphQL instructions entries, filtering ads."""
    parsed_tweets = []
    for instruction in instructions:
        type_ = instruction.get("type")
        entries = []
        if type_ == "TimelineAddEntries":
            entries = instruction.get("entries", [])
        elif type_ == "TimelineAddToModule":
            entries = instruction.get("moduleItems", [])

        for entry in entries:
            entry_id = entry.get("entryId", "")
            # Skip promoted / ad tweets and cursors
            if "promoted" in entry_id.lower() or entry_id.startswith("cursor-"):
                continue

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


def extract_timeline_instructions(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Recursively locates 'instructions' array in arbitrary X GraphQL response payloads."""
    d = data.get("data", {})
    if "list" in d:
        list_obj = d["list"]
        if isinstance(list_obj, dict):
            tl = list_obj.get("tweets_timeline", {}).get("timeline", {})
            if "instructions" in tl and isinstance(tl["instructions"], list):
                return tl["instructions"]
    if "user" in d:
        user_obj = d["user"].get("result", {})
        tl = user_obj.get("timeline", {}).get("timeline", {}) or user_obj.get("timeline_v2", {}).get("timeline", {})
        if "instructions" in tl and isinstance(tl["instructions"], list):
            return tl["instructions"]
    if "home" in d:
        tl = d["home"].get("home_timeline_urt", {})
        if "instructions" in tl and isinstance(tl["instructions"], list):
            return tl["instructions"]
    if "search_by_raw_query" in d:
        tl = d["search_by_raw_query"].get("search_timeline", {}).get("timeline", {})
        if "instructions" in tl and isinstance(tl["instructions"], list):
            return tl["instructions"]

    # Fallback search
    stack = [data]
    while stack:
        curr = stack.pop()
        if isinstance(curr, dict):
            if "instructions" in curr and isinstance(curr["instructions"], list):
                return curr["instructions"]
            stack.extend(curr.values())
        elif isinstance(curr, list):
            stack.extend(curr)
    return []


def parse_trends_from_graphql(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extracts organic trends from ExplorePage or GenericTimelineById GraphQL responses.
    Filters out sponsored/promoted trends and extracts ranks, categories, and queries.
    """
    trends: list[dict[str, Any]] = []
    seen: set[str] = set()

    def process_item_content(ic: dict, is_ai: bool = False) -> None:
        if not isinstance(ic, dict):
            return
        if ic.get("__typename") != "TimelineTrend" and not is_ai:
            return

        name = ic.get("name")
        if not name or name in seen:
            return

        # Filter out sponsored / promoted trends
        if ic.get("promoted_metadata"):
            return
        tm = ic.get("trend_metadata", {})
        meta_desc = tm.get("meta_description", "")
        if "promoted" in meta_desc.lower():
            return

        domain = tm.get("domain_context", "")
        rank_str = ic.get("rank")
        try:
            rank = int(rank_str) if rank_str else len(trends) + 1
        except Exception:
            rank = len(trends) + 1

        # Extract search query
        query = name
        url_obj = tm.get("url", {})
        deep_link = url_obj.get("url", "")
        if "query=" in deep_link:
            match = re.search(r"query=([^&]+)", deep_link)
            if match:
                query = urllib.parse.unquote_plus(match.group(1)).strip('"')

        seen.add(name)
        trends.append({
            "name": name,
            "query": query,
            "rank": rank,
            "domain": domain,
            "volume": meta_desc if meta_desc and "promoted" not in meta_desc.lower() else "高热度讨论",
            "is_ai_trend": is_ai or ic.get("is_ai_trend", False),
        })

    def walk(d: Any) -> None:
        if isinstance(d, dict):
            if "itemContent" in d:
                process_item_content(d["itemContent"])
            if "items" in d and isinstance(d["items"], list):
                for sub in d["items"]:
                    sub_ic = sub.get("item", {}).get("itemContent", {})
                    process_item_content(sub_ic, is_ai=True)
            for v in d.values():
                walk(v)
        elif isinstance(d, list):
            for x in d:
                walk(x)

    walk(payload)
    trends.sort(key=lambda t: t["rank"])
    return trends


class XClient:
    def __init__(self, timeout: int | None = None) -> None:
        self.timeout_seconds = timeout or Config.FETCH_TIMEOUT
        self.timeout_ms = self.timeout_seconds * 1000
        self.proxy_dict = None
        if Config.HTTP_PROXY:
            self.proxy_dict = {"server": Config.HTTP_PROXY}

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
            if "/graphql/" in url and ("HomeLatestTimeline" in url or "HomeTimeline" in url) and response.status == 200:
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

            console.print(f"[cyan]🌐 正在打开 x.com/home 并挂载网络监听器（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto("https://x.com/home", wait_until="commit", timeout=timeout_ms)

            # Wait briefly for tablist to appear (signals React app has finished rendering)
            console.print("[cyan]⏳ 正在等待时间线导航就绪...[/cyan]")
            try:
                await page.wait_for_selector('div[role="tablist"], [role="tab"]', timeout=15000)
            except Exception:
                pass

            # Check if redirected to login
            if "login" in page.url or "i/flow" in page.url:
                await browser.close()
                raise RuntimeError("X 认证失败：页面被重定向至登录页。请检查 auth_token 是否过期。")

            # Click "Following" tab to ensure we are receiving Following timeline
            try:
                following_tab = page.locator('[role="tab"]', has_text=re.compile(r"Following|正在关注|关注", re.I)).first
                if await following_tab.is_visible(timeout=5000):
                    console.print("[cyan]📌 切换至「正在关注 (Following)」时间线...[/cyan]")
                    await following_tab.click()
                    await page.wait_for_timeout(4000)
            except Exception as e:
                logger.debug(f"Could not click following tab directly: {e}")

            # Scroll down to trigger pagination and collect more pages
            for page_idx in range(1, max_pages):
                console.print(f"[cyan]📜 正在向下滚动加载第 {page_idx + 1} 页推文...[/cyan]")
                await page.evaluate("window.scrollBy(0, 2500)")
                await page.wait_for_timeout(int(page_delay * 1000))

            # Brief pause to ensure last in-flight responses complete
            await page.wait_for_timeout(2000)
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

    async def fetch_user_timeline(
        self,
        username: str,
        limit: int = 20,
        page_delay: float = 2.0,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Intercepts GraphQL responses for a specific user's timeline (UserOriginalsTimeline / UserTweets).
        """
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 填写 X_AUTH_TOKEN 或运行 python main.py --login。")

        clean_user = username.lstrip("@").strip()
        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        captured_raw_instructions: list[list[dict[str, Any]]] = []

        async def handle_response(response: Response) -> None:
            url = response.url
            if "/graphql/" in url and ("UserOriginalsTimeline" in url or "UserTweets" in url) and response.status == 200:
                try:
                    data = await response.json()
                    user_data = data.get("data", {}).get("user", {}).get("result", {})
                    timeline = user_data.get("timeline", {})
                    if "timeline" in timeline:
                        timeline = timeline.get("timeline", {})
                    elif "timeline_v2" in user_data:
                        timeline = user_data.get("timeline_v2", {}).get("timeline", {})

                    instructions = timeline.get("instructions", [])
                    if instructions:
                        captured_raw_instructions.append(instructions)
                except Exception as e:
                    logger.debug(f"Failed to parse user timeline response: {e}")

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()
            page.on("response", handle_response)

            user_url = f"https://x.com/{clean_user}"
            console.print(f"[cyan]🌐 正在打开博主主页 {user_url} 并监听推文流（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto(user_url, wait_until="commit", timeout=timeout_ms)

            # Wait for first response to land
            for _ in range(max(30, timeout_s)):
                await asyncio.sleep(1)
                if captured_raw_instructions:
                    break

            # If user requests more than ~20 tweets, scroll down to paginate
            pages_needed = max(1, (limit + 19) // 20)
            for page_idx in range(1, pages_needed):
                console.print(f"[cyan]📜 正在向下滚动加载第 {page_idx + 1} 页...[/cyan]")
                await page.evaluate("window.scrollBy(0, 2500)")
                await page.wait_for_timeout(int(page_delay * 1000))

            await page.wait_for_timeout(2000)
            await browser.close()

        all_tweets: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for inst_list in captured_raw_instructions:
            batch_tweets = parse_timeline_instructions(inst_list)
            for t in batch_tweets:
                if t["tweet_id"] not in seen_ids:
                    seen_ids.add(t["tweet_id"])
                    all_tweets.append(t)

        return all_tweets[:limit]

    async def fetch_list_timeline(
        self,
        list_id_or_url: str,
        limit: int = 20,
        page_delay: float = 2.0,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Intercepts GraphQL responses for a specific X List (ListLatestTweetsTimeline / ListTweetsTimeline).
        Accepts full URL or numeric list ID.
        """
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 填写 X_AUTH_TOKEN 或运行 python main.py --login。")

        match = re.search(r"(\d{5,})", list_id_or_url)
        if not match:
            raise ValueError(f"无效的列表 ID 或 URL：'{list_id_or_url}'。X 列表 URL 形如 https://x.com/i/lists/1838848123456789012 或直接输入数字 ID。")

        list_id = match.group(1)
        target_url = f"https://x.com/i/lists/{list_id}"
        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        captured_raw_instructions: list[list[dict[str, Any]]] = []

        async def handle_response(response: Response) -> None:
            url = response.url
            if "/graphql/" in url and ("ListLatestTweetsTimeline" in url or "ListTweetsTimeline" in url or "List" in url) and response.status == 200:
                try:
                    data = await response.json()
                    instructions = extract_timeline_instructions(data)
                    if instructions:
                        captured_raw_instructions.append(instructions)
                except Exception as e:
                    logger.debug(f"Failed to parse list timeline response: {e}")

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()
            page.on("response", handle_response)

            console.print(f"[cyan]🌐 正在打开 X 列表主页 {target_url} 并监听推文流（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto(target_url, wait_until="commit", timeout=timeout_ms)

            # Wait for first response to land
            for _ in range(max(30, timeout_s)):
                await asyncio.sleep(1)
                if captured_raw_instructions:
                    break

            # If user requests more than ~20 tweets, scroll down to paginate
            pages_needed = max(1, (limit + 19) // 20)
            for page_idx in range(1, pages_needed):
                console.print(f"[cyan]📜 正在向下滚动加载第 {page_idx + 1} 页...[/cyan]")
                await page.evaluate("window.scrollBy(0, 2500)")
                await page.wait_for_timeout(int(page_delay * 1000))

            await page.wait_for_timeout(2000)
            await browser.close()

        all_tweets: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for inst_list in captured_raw_instructions:
            batch_tweets = parse_timeline_instructions(inst_list)
            for t in batch_tweets:
                if t["tweet_id"] not in seen_ids:
                    seen_ids.add(t["tweet_id"])
                    all_tweets.append(t)

        return all_tweets[:limit]

    async def fetch_search_timeline(
        self,
        query: str,
        search_type: str = "live",
        limit: int = 20,
        page_delay: float = 2.0,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Intercepts GraphQL responses for an X Search query (SearchTimeline).
        Supports search_type='live' (latest) or 'top' (top results).
        """
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 填写 X_AUTH_TOKEN 或运行 python main.py --login。")

        clean_q = query.strip()
        encoded_q = urllib.parse.quote(clean_q)
        if search_type.lower() == "top":
            target_url = f"https://x.com/search?q={encoded_q}"
        else:
            target_url = f"https://x.com/search?q={encoded_q}&f=live"

        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        captured_raw_instructions: list[list[dict[str, Any]]] = []

        async def handle_response(response: Response) -> None:
            url = response.url
            if "/graphql/" in url and ("SearchTimeline" in url or "Search" in url) and response.status == 200:
                try:
                    data = await response.json()
                    instructions = extract_timeline_instructions(data)
                    if instructions:
                        captured_raw_instructions.append(instructions)
                except Exception as e:
                    logger.debug(f"Failed to parse search timeline response: {e}")

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()
            page.on("response", handle_response)

            type_label = "实时最新" if search_type.lower() != "top" else "热门"
            console.print(f"[cyan]🌐 正在打开 X 搜索 ({type_label}: '{clean_q}') 并监听推文流（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto(target_url, wait_until="commit", timeout=timeout_ms)

            # Wait for first response to land
            for _ in range(max(30, timeout_s)):
                await asyncio.sleep(1)
                if captured_raw_instructions:
                    break

            # If user requests more than ~20 tweets, scroll down to paginate
            pages_needed = max(1, (limit + 19) // 20)
            for page_idx in range(1, pages_needed):
                console.print(f"[cyan]📜 正在向下滚动加载第 {page_idx + 1} 页...[/cyan]")
                await page.evaluate("window.scrollBy(0, 2500)")
                await page.wait_for_timeout(int(page_delay * 1000))

            await page.wait_for_timeout(2000)
            await browser.close()

        all_tweets: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for inst_list in captured_raw_instructions:
            batch_tweets = parse_timeline_instructions(inst_list)
            for t in batch_tweets:
                if t["tweet_id"] not in seen_ids:
                    seen_ids.add(t["tweet_id"])
                    all_tweets.append(t)

        return all_tweets[:limit]

    async def fetch_tweet_thread(
        self,
        tweet_id_or_url: str,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Fetches a single tweet and its author thread from X by tweet ID or URL.
        Intercepts TweetDetail and TweetResultByRestId GraphQL responses.
        """
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 填写 X_AUTH_TOKEN 或运行 python main.py --login。")

        match = re.search(r"(\d{5,})", tweet_id_or_url)
        if not match:
            raise ValueError(f"无效的推文 ID 或 URL：'{tweet_id_or_url}'。")

        clean_id = match.group(1)
        if "article" in tweet_id_or_url.lower():
            target_url = f"https://x.com/i/article/{clean_id}"
        else:
            target_url = f"https://x.com/i/status/{clean_id}"
        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        captured_tweets: list[dict[str, Any]] = []

        async def handle_response(response: Response) -> None:
            url = response.url
            if "/graphql/" in url and response.status == 200:
                if "TweetDetail" in url or "TweetResult" in url or "Article" in url:
                    try:
                        data = await response.json()
                        d = data.get("data", {})
                        if "tweetResult" in d:
                            t = parse_tweet_result(d["tweetResult"].get("result", {}))
                            if t and t["tweet_id"]:
                                captured_tweets.append(t)
                        if "article_result_by_rest_id" in d:
                            art_res = d["article_result_by_rest_id"].get("result", {})
                            if art_res:
                                art_md, art_imgs = parse_x_article_to_markdown(art_res)
                                meta = art_res.get("metadata", {})
                                author_res = meta.get("author_results", {}).get("result", {})
                                a_user = author_res.get("core", {}).get("screen_name") or author_res.get("legacy", {}).get("screen_name", "")
                                a_name = author_res.get("core", {}).get("name") or author_res.get("legacy", {}).get("name", "")
                                art_id = art_res.get("rest_id") or clean_id
                                captured_tweets.append({
                                    "tweet_id": str(art_id),
                                    "author_id": str(author_res.get("rest_id", "")),
                                    "author_name": a_name,
                                    "author_username": a_user,
                                    "text": art_md,
                                    "created_at": art_res.get("created_at", ""),
                                    "is_retweet": False,
                                    "retweeted_author": "",
                                    "retweeted_text": "",
                                    "is_quote": False,
                                    "quoted_author": "",
                                    "quoted_text": "",
                                    "like_count": 0,
                                    "retweet_count": 0,
                                    "reply_count": 0,
                                    "view_count": 0,
                                    "urls": [f"https://x.com/i/article/{clean_id}"],
                                    "media_urls": art_imgs,
                                })
                        instructions = extract_timeline_instructions(data)
                        if instructions:
                            inst_tweets = parse_timeline_instructions(instructions)
                            captured_tweets.extend(inst_tweets)
                    except Exception as e:
                        logger.debug(f"Failed to parse tweet response: {e}")

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()
            page.on("response", handle_response)

            type_label = "专栏文章" if "article" in tweet_id_or_url.lower() else "推文页面"
            console.print(f"[cyan]🌐 正在打开 X {type_label} {target_url} 并获取内容（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto(target_url, wait_until="commit", timeout=timeout_ms)

            for _ in range(max(30, timeout_s)):
                await asyncio.sleep(1)
                if captured_tweets:
                    await asyncio.sleep(2)
                    break

            await browser.close()

        seen_ids = set()
        unique_tweets = []
        for t in captured_tweets:
            if t["tweet_id"] not in seen_ids:
                seen_ids.add(t["tweet_id"])
                unique_tweets.append(t)

        return unique_tweets

    async def fetch_explore_trends(
        self,
        category: str = "tech",
        top: int = 10,
        timeout: int | None = None,
    ) -> list[dict[str, Any]]:
        """
        Intercepts official Explore / Trending GraphQL endpoints (ExplorePage & GenericTimelineById).
        Supports category filtering (tech, all, business, news, entertainment, sports).
        """
        if not Config.validate_x_credentials():
            raise ValueError("未配置认证信息：请在 .env 填写 X_AUTH_TOKEN 或运行 python main.py --login。")

        cat = category.lower().strip()
        cat_urls = {
            "sports": "https://x.com/explore/tabs/sports_unified",
            "entertainment": "https://x.com/explore/tabs/entertainment_unified",
            "news": "https://x.com/explore/tabs/news_unified",
            "all": "https://x.com/explore",
            "business": "https://x.com/explore",
            "tech": "https://x.com/explore",
        }
        target_url = cat_urls.get(cat, "https://x.com/explore")

        timeout_s = timeout or self.timeout_seconds
        timeout_ms = timeout_s * 1000
        intercepted_payloads = []

        async def handle_response(response: Response) -> None:
            url = response.url
            if "/graphql/" in url and response.status == 200:
                if any(k in url for k in ["ExplorePage", "GenericTimelineById", "Explore", "Trends"]):
                    try:
                        data = await response.json()
                        intercepted_payloads.append(data)
                    except Exception as e:
                        logger.debug(f"Failed to parse explore response: {e}")

        async with async_playwright() as p:
            browser = await self._launch_browser(p, headless=True)
            context = await self._setup_context(browser, timeout_ms=timeout_ms)
            page = await context.new_page()
            page.on("response", handle_response)

            console.print(f"[cyan]🌐 正在打开 X 趋势中心 ({target_url}) 并拦截热点流（超时阈值: {timeout_s} 秒）...[/cyan]")
            await page.goto(target_url, wait_until="domcontentloaded", timeout=timeout_ms)

            for _ in range(max(20, timeout_s)):
                await asyncio.sleep(1)
                if len(intercepted_payloads) >= 1:
                    await asyncio.sleep(2)  # Brief pause to capture any secondary batch
                    break

            await browser.close()

        all_trends: list[dict[str, Any]] = []
        seen_names = set()
        for payload in intercepted_payloads:
            for item in parse_trends_from_graphql(payload):
                if item["name"] not in seen_names:
                    seen_names.add(item["name"])
                    all_trends.append(item)

        # Categorization logic
        filtered = []
        tech_keywords = {
            "ai", "model", "llm", "claude", "gpt", "deepseek", "qwen", "tech",
            "code", "software", "nvidia", "apple", "google", "alibaba", "robot",
            "openai", "agent", "data", "meta", "chips", "hardware"
        }
        biz_keywords = {"business", "finance", "economy", "stock", "market", "fund", "cpi", "fed", "ipo", "trading"}
        news_keywords = {"news", "politics", "war", "minister", "president", "gulf", "policy", "election"}

        for t in all_trends:
            domain_l = t["domain"].lower()
            name_l = t["name"].lower()

            if cat == "all":
                filtered.append(t)
            elif cat == "tech":
                if t["is_ai_trend"] or "tech" in domain_l or any(k in name_l for k in tech_keywords):
                    filtered.append(t)
            elif cat == "business":
                if "business" in domain_l or "finance" in domain_l or any(k in name_l for k in biz_keywords):
                    filtered.append(t)
            elif cat == "news":
                if "news" in domain_l or "politics" in domain_l or any(k in name_l for k in news_keywords):
                    filtered.append(t)
            elif cat == "sports":
                if "sports" in domain_l:
                    filtered.append(t)
            elif cat == "entertainment":
                if "entertainment" in domain_l:
                    filtered.append(t)
            else:
                filtered.append(t)

        # If domain-specific filtering returned fewer than requested, supplement with top general organic trends
        if len(filtered) < top:
            for t in all_trends:
                if t not in filtered:
                    filtered.append(t)
                if len(filtered) >= top:
                    break

        return filtered[:top]

