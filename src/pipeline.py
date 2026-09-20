import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from rich.console import Console
from .config import Config
from .storage import Storage
from .client import XClient
from .summarizer import Summarizer

console = Console()


class Pipeline:
    def __init__(self) -> None:
        Config.ensure_dirs()
        self.storage = Storage()
        self.client = XClient()

    async def fetch_and_store(
        self,
        max_pages: int | None = None,
        timeout: int | None = None
    ) -> tuple[int, int, int]:
        """
        Fetches tweets from Following timeline and stores in SQLite.
        Returns: (fetched_count, inserted_count, skipped_count)
        """
        pages = max_pages or Config.FETCH_MAX_PAGES
        console.print(f"[bold cyan]⏳ 开始从 X (Following 时间线) 抓取推文，计划拉取 {pages} 页...[/bold cyan]")

        tweets = await self.client.fetch_following_timeline(max_pages=pages, timeout=timeout)
        fetched_count = len(tweets)
        console.print(f"[green]✓ 成功拉取到 {fetched_count} 条推文[/green]")

        if fetched_count > 0:
            # Save raw snapshot for disaster recovery / audit
            now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            raw_path = Config.RAW_DIR / f"raw_{now_str}.json"
            with open(raw_path, "w", encoding="utf-8") as f:
                json.dump(tweets, f, ensure_ascii=False, indent=2)

            inserted, skipped = self.storage.save_tweets(tweets)
            console.print(
                f"[bold green]✓ 本地库更新完毕：新增入库 {inserted} 条，跳过重复 {skipped} 条 (库内总计 {self.storage.get_total_count()} 条)[/bold green]"
            )
            return fetched_count, inserted, skipped
        else:
            console.print("[yellow]⚠️ 未拉取到推文，请检查网络或账号状态[/yellow]")
            return 0, 0, 0

    async def fetch_user_and_store(
        self,
        username: str,
        limit: int = 20,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Fetches recent tweets for a specific user and stores them in SQLite.
        """
        clean_user = username.lstrip("@").strip()
        console.print(f"[bold cyan]⏳ 开始抓取博主 @{clean_user} 的最新推文（目标 {limit} 篇）...[/bold cyan]")
        tweets = await self.client.fetch_user_timeline(clean_user, limit=limit, timeout=timeout)
        fetched_count = len(tweets)
        console.print(f"[green]✓ 成功拉取到 {fetched_count} 条 @{clean_user} 的推文[/green]")

        if fetched_count > 0:
            inserted, skipped = self.storage.save_tweets(tweets)
            console.print(
                f"[bold green]✓ 本地库更新完毕：新增入库 {inserted} 条，跳过重复 {skipped} 条 (库内总计 {self.storage.get_total_count()} 条)[/bold green]"
            )
        return tweets

    async def fetch_list_and_store(
        self,
        list_id_or_url: str,
        limit: int = 20,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Fetches recent tweets from a specific X List and stores them in SQLite.
        """
        console.print(f"[bold cyan]⏳ 开始抓取 X 列表 ({list_id_or_url}) 的最新推文（目标 {limit} 篇）...[/bold cyan]")
        tweets = await self.client.fetch_list_timeline(list_id_or_url, limit=limit, timeout=timeout)
        fetched_count = len(tweets)
        console.print(f"[green]✓ 成功从列表拉取到 {fetched_count} 条推文[/green]")

        if fetched_count > 0:
            inserted, skipped = self.storage.save_tweets(tweets)
            console.print(
                f"[bold green]✓ 本地库更新完毕：新增入库 {inserted} 条，跳过重复 {skipped} 条 (库内总计 {self.storage.get_total_count()} 条)[/bold green]"
            )
        return tweets

    async def fetch_tweet_and_store(
        self,
        tweet_id_or_url: str,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Fetches a single tweet and its thread from X and stores them in SQLite.
        """
        console.print(f"[bold cyan]⏳ 开始抓取推文 ({tweet_id_or_url})...[/bold cyan]")
        tweets = await self.client.fetch_tweet_thread(tweet_id_or_url, timeout=timeout)
        fetched_count = len(tweets)
        console.print(f"[green]✓ 成功从 X 拉取到 {fetched_count} 条相关推文[/green]")

        if fetched_count > 0:
            inserted, skipped = self.storage.save_tweets(tweets)
            console.print(
                f"[bold green]✓ 本地库更新完毕：新增入库 {inserted} 条，跳过重复 {skipped} 条 (库内总计 {self.storage.get_total_count()} 条)[/bold green]"
            )
        return tweets

    async def fetch_search_and_store(
        self,
        query: str,
        search_type: str = "live",
        limit: int = 20,
        min_likes: int = 0,
        min_retweets: int = 0,
        timeout: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Searches tweets on X by query, applies engagement filters, and stores them in SQLite.
        """
        type_str = "实时最新" if search_type.lower() != "top" else "热门"
        console.print(f"[bold cyan]⏳ 开始在 X 搜索 ('{query}', {type_str})，目标 {limit} 篇...[/bold cyan]")
        tweets = await self.client.fetch_search_timeline(
            query=query,
            search_type=search_type,
            limit=limit,
            timeout=timeout
        )
        fetched_count = len(tweets)
        console.print(f"[green]✓ 成功从搜索拉取到 {fetched_count} 条推文[/green]")

        filtered_tweets = []
        for t in tweets:
            if t.get("like_count", 0) >= min_likes and t.get("retweet_count", 0) >= min_retweets:
                filtered_tweets.append(t)

        if (min_likes > 0 or min_retweets > 0) and len(filtered_tweets) < fetched_count:
            console.print(
                f"[dim]ℹ️ 互动门槛过滤：保留 {len(filtered_tweets)} 条符合条件的推文 (点赞 ≥ {min_likes}, 转发 ≥ {min_retweets})[/dim]"
            )

        if fetched_count > 0:
            inserted, skipped = self.storage.save_tweets(tweets)
            console.print(
                f"[bold green]✓ 本地库更新完毕：新增入库 {inserted} 条，跳过重复 {skipped} 条 (库内总计 {self.storage.get_total_count()} 条)[/bold green]"
            )
        return filtered_tweets

    def generate_report(
        self,
        hours: int = 24,
        date_str: str | None = None,
        min_likes: int = 0,
        min_retweets: int = 0
    ) -> Path | None:
        """
        Retrieves recent tweets from SQLite and generates an AI summary report.
        """
        filter_msg = f"（最低赞数 ≥ {min_likes}）" if min_likes > 0 else ""
        console.print(f"[bold cyan]🔍 正在从本地数据库检索近 {hours} 小时的推文{filter_msg}...[/bold cyan]")
        tweets = self.storage.get_unsummarized_tweets(
            hours=hours,
            min_likes=min_likes,
            min_retweets=min_retweets
        )

        if not tweets:
            console.print("[yellow]⚠️ 本地数据库在指定时间窗口内没有符合条件的推文数据，无法生成早报。[/yellow]")
            return None

        console.print(f"[cyan]ℹ️ 找到 {len(tweets)} 条相关推文，正在调用 Gemini 模型进行主题聚类与提炼...[/cyan]")
        summarizer = Summarizer()
        today = date_str or datetime.now().strftime("%Y-%m-%d")
        report_content = summarizer.summarize(tweets, target_date=today)

        report_file = Config.REPORTS_DIR / f"{today}.md"
        with open(report_file, "w", encoding="utf-8") as f:
            f.write(report_content)

        console.print(f"[bold green]🎉 早报已生成：{report_file}[/bold green]")
        return report_file

    async def run_daily(
        self,
        max_pages: int | None = None,
        hours: int = 24,
        min_likes: int = 0,
        min_retweets: int = 0,
        timeout: int | None = None
    ) -> Path | None:
        """
        Runs the end-to-end workflow: Fetch -> Store -> Summarize.
        """
        await self.fetch_and_store(max_pages=max_pages, timeout=timeout)
        return self.generate_report(hours=hours, min_likes=min_likes, min_retweets=min_retweets)
