import argparse
import asyncio
import json
import sys
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from src.config import Config
from src.client import XClient
from src.storage import Storage
from src.pipeline import Pipeline

console = Console()


async def check_auth_cmd(timeout: int | None = None) -> None:
    console.print("[cyan]🔍 正在验证 X 登录状态与 Cookie 有效性...[/cyan]")
    if not Config.validate_x_credentials():
        console.print(
            "[bold red]❌ 未配置认证凭据。[/bold red]\n"
            "建议方式：\n"
            "1. 运行 `uv run python main.py --login` 弹出浏览器窗口直接登录（最省心，自动持久化凭证）。\n"
            "2. 或在 `.env` 中填写 `X_AUTH_TOKEN` 和 `X_CT0`。"
        )
        sys.exit(1)

    client = XClient(timeout=timeout)
    try:
        user_info = await client.verify_auth(timeout=timeout)
        console.print(Panel(
            f"[bold green]认证成功！[/bold green]\n"
            f"状态: 会话有效\n"
            f"信息: [cyan]{user_info['name']}[/cyan] ({user_info['screen_name']})\n"
            f"代理配置: {Config.HTTP_PROXY or '直连'}",
            title="X Session Status"
        ))
    except Exception as e:
        console.print(Panel(
            f"[bold red]认证失败[/bold red]\n原因: {e}\n\n"
            f"你可以重新运行 `uv run python main.py --login` 重新登录更新凭据。",
            title="X Session Error"
        ))
        sys.exit(1)


def list_tweets_cmd(limit: int = 20) -> None:
    storage = Storage()
    total = storage.get_total_count()
    tweets = storage.get_recent_tweets(limit=limit)

    if not tweets:
        console.print("[yellow]⚠️ 数据库中暂无推文，请先运行 `uv run python main.py --fetch-only` 进行抓取。[/yellow]")
        return

    table = Table(title=f"X Following 时间线推文列表 (库内共 {total} 条，展示最近 {len(tweets)} 条)", show_lines=True)
    table.add_column("#", style="dim", width=4, justify="center")
    table.add_column("作者", style="cyan", width=20, no_wrap=True)
    table.add_column("推文摘要", style="white", min_width=35)
    table.add_column("互动", justify="right", width=12, no_wrap=True)
    table.add_column("推文 ID", style="dim", width=20, no_wrap=True)

    for idx, t in enumerate(tweets, 1):
        author = f"{t.get('author_name', '')}\n@{t.get('author_username', '')}"
        text = " ".join(t.get("text", "").split())
        if len(text) > 75:
            text = text[:72] + "..."
        metrics = f"❤️ {t.get('like_count', 0)}\n🔁 {t.get('retweet_count', 0)}"
        table.add_row(str(idx), author, text, metrics, str(t.get("tweet_id", "")))

    console.print(table)
    console.print(
        "\n[dim]💡 提示：\n"
        "• 查看单篇推文全文及多媒体：`uv run python main.py --view <推文ID>`\n"
        "• 导出全量推文为 Markdown 查阅：`uv run python main.py --export`[/dim]"
    )


def view_tweet_cmd(tweet_id: str) -> None:
    storage = Storage()
    t = storage.get_tweet_by_id(tweet_id)
    if not t:
        console.print(f"[bold red]❌ 未找到 ID 为 `{tweet_id}` 的推文。请确认 ID 是否正确。[/bold red]")
        return

    author = f"{t.get('author_name')} (@{t.get('author_username')})"
    url = f"https://x.com/{t.get('author_username')}/status/{t.get('tweet_id')}"
    metrics = f"❤️ 赞: {t.get('like_count', 0)}  |  🔁 转发: {t.get('retweet_count', 0)}  |  💬 回复: {t.get('reply_count', 0)}  |  👁️ 浏览: {t.get('view_count', 0)}"

    content = f"[bold cyan]作者:[/bold cyan] {author}\n"
    content += f"[bold cyan]发布时间:[/bold cyan] {t.get('created_at', '未知')}\n"
    content += f"[bold cyan]原文链接:[/bold cyan] [link={url}]{url}[/link]\n"
    content += f"[bold cyan]互动数据:[/bold cyan] {metrics}\n"
    content += "─" * 60 + "\n\n"
    content += f"[bold]正文:[/bold]\n{t.get('text', '')}\n"

    if t.get("is_retweet"):
        content += f"\n[yellow]🔁 转推自 @{t.get('retweeted_author')}:[/yellow]\n{t.get('retweeted_text')}\n"
    elif t.get("is_quote"):
        content += f"\n[yellow]💬 引用推文 @{t.get('quoted_author')}:[/yellow]\n{t.get('quoted_text')}\n"

    try:
        urls = json.loads(t.get("urls") or "[]")
        if urls:
            content += "\n[cyan]🔗 附带链接:[/cyan]\n" + "\n".join(f"  - {u}" for u in urls) + "\n"
    except Exception:
        pass

    try:
        media = json.loads(t.get("media_urls") or "[]")
        if media:
            content += "\n[cyan]🖼️ 媒体附件:[/cyan]\n" + "\n".join(f"  - {m}" for m in media) + "\n"
    except Exception:
        pass

    console.print(Panel(content, title=f"推文详情: {t.get('tweet_id')}", expand=False))


def export_cmd(limit: int = 200) -> None:
    storage = Storage()
    file_path = storage.export_markdown(limit=limit)
    console.print(f"[bold green]🎉 推文清单已导出为 Markdown 文档: {file_path}[/bold green]")
    console.print(f"[dim]已归档最近 {min(limit, storage.get_total_count())} 条推文。可在编辑器或 Markdown 阅读器中点击直接阅读。[/dim]")


async def main() -> None:
    parser = argparse.ArgumentParser(description="X Following Timeline AI Digest CLI")
    parser.add_argument(
        "--login",
        action="store_true",
        help="打开可视化浏览器窗口登录 X，并持久化保存会话凭据（免手工查 Cookie）"
    )
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="验证 X Cookie 凭证或本地会话是否有效"
    )
    parser.add_argument(
        "--fetch-only",
        action="store_true",
        help="仅抓取 Following 推文并存入本地 SQLite，不生成总结"
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="仅根据本地已有推文生成今日早报，不发起网络请求"
    )
    parser.add_argument(
        "--list",
        nargs="?",
        const=20,
        type=int,
        metavar="N",
        help="查看已抓取推文列表（默认最近 20 条，可指定数量，如 --list 50）"
    )
    parser.add_argument(
        "--view",
        type=str,
        metavar="TWEET_ID",
        help="查看指定 ID 的推文全文详情及互动数据"
    )
    parser.add_argument(
        "--export",
        nargs="?",
        const=200,
        type=int,
        metavar="N",
        help="将已抓取的推文导出为结构化 Markdown 文档（输出至 output/tweets_YYYY-MM-DD.md）"
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=None,
        help="本次抓取的页数（默认读取配置，通常 3 页约 60 条）"
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="早报统计回溯时间窗口（默认近 24 小时）"
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=None,
        help="网络请求与页面加载超时时间（秒，默认 60 秒）"
    )

    args = parser.parse_args()

    if args.login:
        client = XClient(timeout=args.timeout)
        await client.login_interactive(timeout=args.timeout)
        return

    if args.check_auth:
        await check_auth_cmd(timeout=args.timeout)
        return

    if args.list is not None:
        list_tweets_cmd(limit=args.list)
        return

    if args.view:
        view_tweet_cmd(args.view)
        return

    if args.export is not None:
        export_cmd(limit=args.export)
        return

    pipeline = Pipeline()

    if args.fetch_only:
        await pipeline.fetch_and_store(max_pages=args.pages, timeout=args.timeout)
        return

    if args.report_only:
        pipeline.generate_report(hours=args.hours)
        return

    # Default: Run full pipeline
    await pipeline.run_daily(max_pages=args.pages, hours=args.hours, timeout=args.timeout)


if __name__ == "__main__":
    asyncio.run(main())
