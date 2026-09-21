import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from src.config import Config
from src.client import XClient
from src.storage import Storage
from src.pipeline import Pipeline
from src.auth import run_interactive_login

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


def render_tweets_table(tweets: list[dict], title: str) -> None:
    table = Table(title=title, show_lines=True)
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


def list_tweets_cmd(
    limit: int = 20,
    username: str | None = None,
    min_likes: int = 0,
    min_retweets: int = 0
) -> None:
    storage = Storage()
    filter_desc = []
    if min_likes > 0:
        filter_desc.append(f"❤️ ≥ {min_likes}")
    if min_retweets > 0:
        filter_desc.append(f"🔁 ≥ {min_retweets}")
    filter_str = f" [门槛: {', '.join(filter_desc)}]" if filter_desc else ""

    if username:
        clean_user = username.lstrip("@").strip()
        tweets = storage.get_tweets_by_user(
            clean_user,
            limit=limit,
            min_likes=min_likes,
            min_retweets=min_retweets
        )
        if not tweets:
            console.print(f"[yellow]⚠️ 本地数据库暂无符合条件的博主 @{clean_user} 的推文。[/yellow]")
            return
        render_tweets_table(tweets, f"博主 @{clean_user} 的推文列表{filter_str} (展示最近 {len(tweets)} 条)")
    else:
        total = storage.get_total_count()
        tweets = storage.get_recent_tweets(
            limit=limit,
            min_likes=min_likes,
            min_retweets=min_retweets
        )
        if not tweets:
            console.print("[yellow]⚠️ 数据库中暂无符合条件的推文，请调整过滤门槛或先抓取数据。[/yellow]")
            return
        render_tweets_table(tweets, f"推文列表{filter_str} (库内共 {total} 条，展示符合条件的最近 {len(tweets)} 条)")


async def view_tweet_cmd(
    tweet_id_or_url: str,
    timeout: int | None = None,
    export_md: bool = True,
    output_path: str | None = None
) -> None:
    storage = Storage()
    match = re.search(r"(\d{5,})", tweet_id_or_url)
    clean_id = match.group(1) if match else tweet_id_or_url.strip()

    t = storage.get_tweet_by_id(clean_id)
    if not t:
        console.print(f"[cyan]🔍 本地数据库未检索到推文 `{clean_id}`，正在从 X 实时抓取...[/cyan]")
        pipeline = Pipeline()
        try:
            await pipeline.fetch_tweet_and_store(clean_id, timeout=timeout)
            t = storage.get_tweet_by_id(clean_id)
        except Exception as e:
            console.print(f"[bold red]❌ 抓取推文失败: {e}[/bold red]")
            return

    if not t:
        console.print(f"[bold red]❌ 未能获取到 ID 为 `{clean_id}` 的推文。请确认链接或 ID 是否有效。[/bold red]")
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

    if export_md:
        console.print("[cyan]💾 正在导出单篇推文 Markdown 文档并下载图片资源...[/cyan]")
        try:
            md_file, dl_count = storage.export_single_tweet_markdown(
                clean_id,
                output_path=output_path,
                download_images=True
            )
            console.print(f"[bold green]🎉 推文已导出为 Markdown 文档: {md_file}[/bold green]")
            if dl_count > 0:
                console.print(f"[green]🖼️ 已同步下载 {dl_count} 张图片至: {md_file.parent / 'images' / clean_id}[/green]")
            console.print("[dim]可在 Markdown 编辑器中直接查阅，文中图片已自动关联本地相对路径。[/dim]\n")
        except Exception as e:
            console.print(f"[bold red]❌ 导出 Markdown 失败: {e}[/bold red]")


def export_cmd(
    limit: int = 200,
    output_path: str | None = None,
    min_likes: int = 0,
    min_retweets: int = 0
) -> Path:
    storage = Storage()
    target_path = Path(output_path).expanduser().resolve() if output_path else None
    file_path = storage.export_markdown(
        output_file=target_path,
        limit=limit,
        min_likes=min_likes,
        min_retweets=min_retweets
    )
    console.print(f"[bold green]🎉 推文清单已导出为 Markdown 文档: {file_path}[/bold green]")
    filter_info = f" (门槛: 赞 ≥ {min_likes}, 转发 ≥ {min_retweets})" if (min_likes > 0 or min_retweets > 0) else ""
    console.print(f"[dim]已归档最近 {limit} 条推文{filter_info}。可在编辑器或 Markdown 阅读器中点击直接阅读。[/dim]")
    return file_path


async def main() -> None:
    parser = argparse.ArgumentParser(description="X Following Timeline AI Digest CLI")
    parser.add_argument(
        "--login",
        nargs="?",
        const="x",
        default=None,
        choices=["x", "openai", "gemini"],
        help="打开可视化浏览器登录并自动截获保存凭据（免手工查 Cookie）。支持 x (默认), openai, gemini"
    )
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="验证 X Cookie 凭证或本地会话是否有效"
    )
    parser.add_argument(
        "--trends",
        action="store_true",
        help="查看全网热门趋势榜单看板（模式 1：支持科技、商业、新闻、全网等分类）"
    )
    parser.add_argument(
        "--trends-digest",
        action="store_true",
        help="全自动趋势研报（模式 2：自动拉取热榜、主动挖掘代表性讨论，并通过大模型生成结构化深度研报）"
    )
    parser.add_argument(
        "-c", "--category",
        type=str,
        default="tech",
        choices=["tech", "all", "business", "news", "entertainment", "sports"],
        help="趋势分类主题（默认 tech，可选 all, business, news, entertainment, sports）"
    )
    parser.add_argument(
        "--top",
        type=int,
        default=10,
        metavar="N",
        help="趋势榜单展示或研报挖掘的前 N 个热点话题（默认 10）"
    )
    parser.add_argument(
        "--provider",
        type=str,
        default=None,
        choices=[
            "gemini", "openai", "gpt", "deepseek", "qwen", "qwen-token-plan",
            "glm", "zhipu", "glm-code-plan", "minimax", "kimi", "custom"
        ],
        help="指定大模型提供商（支持 gemini, openai, gpt, deepseek, qwen, qwen-token-plan, glm, glm-code-plan, minimax, kimi, custom）"
    )
    parser.add_argument(
        "--auth-mode",
        type=str,
        default=None,
        choices=["api_key", "account"],
        help="指定大模型认证模式：api_key (API 密钥) 或 account (账号订阅/免 Key)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        metavar="MODEL_NAME",
        help="指定具体的模型名称（如 deepseek-flash, gpt-4o, qwen-plus, kimi-k3 等，覆盖默认配置）"
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
        "--user",
        type=str,
        metavar="USERNAME",
        help="指定博主用户名（如 --user elonmusk 或 @elonmusk）进行针对性抓取或本地检索"
    )
    parser.add_argument(
        "--x-list",
        type=str,
        metavar="LIST_ID_OR_URL",
        help="指定 X 列表 ID 或 URL（如 --x-list 1838848123456789012 或完整链接），抓取该列表的最新推文"
    )
    parser.add_argument(
        "--search",
        type=str,
        metavar="QUERY",
        help="按关键词或高级语法搜索推文（如 --search 'DeepSeek' 或 --search 'AI Agent min_faves:50'）"
    )
    parser.add_argument(
        "--search-type",
        type=str,
        choices=["live", "top"],
        default="live",
        help="搜索结果类型：live (实时最新，默认) 或 top (热门)"
    )
    parser.add_argument(
        "--min-likes",
        type=int,
        default=0,
        metavar="N",
        help="最低点赞门槛过滤（仅保留点赞数 ≥ N 的推文，默认 0 不过滤）"
    )
    parser.add_argument(
        "--min-retweets",
        type=int,
        default=0,
        metavar="N",
        help="最低转发门槛过滤（仅保留转发数 ≥ N 的推文，默认 0 不过滤）"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        metavar="N",
        help="限制获取或展示的推文条数（默认 20 条）"
    )
    parser.add_argument(
        "--list",
        nargs="?",
        const=20,
        type=int,
        metavar="N",
        help="查看已抓取推文列表（默认最近 20 条，可指定数量，如 --list 50；可配合 --user 查看特定博主）"
    )
    parser.add_argument(
        "--view",
        type=str,
        metavar="TWEET_ID",
        help="查看指定 ID 或 URL 的推文全文详情，并默认导出为独立 Markdown 文档"
    )
    parser.add_argument(
        "--export-md",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="获取单篇推文时是否自动导出为独立 Markdown 文档（默认开启；使用 --no-export-md 可关闭仅在终端查看）"
    )
    parser.add_argument(
        "--export",
        nargs="?",
        const=200,
        type=int,
        metavar="N",
        help="将已抓取的推文导出为结构化 Markdown 文档（默认输出至 output/tweets_YYYY-MM-DD.md，可配合 -o/--output 指定路径）"
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        metavar="PATH",
        help="自定义导出 Markdown 文件的路径或目标目录（单篇推文默认为当前目录下的 output 子目录，图片保存在 output/images/）"
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
        await run_interactive_login(args.login, timeout=args.timeout)
        return

    if args.check_auth:
        await check_auth_cmd(timeout=args.timeout)
        return

    if args.list is not None:
        limit = args.list if args.list != 20 else args.limit
        list_tweets_cmd(
            limit=limit,
            username=args.user,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets
        )
        return

    if args.view:
        await view_tweet_cmd(
            args.view,
            timeout=args.timeout,
            export_md=args.export_md,
            output_path=args.output
        )
        if args.export is not None:
            export_cmd(
                limit=args.export,
                output_path=args.output,
                min_likes=args.min_likes,
                min_retweets=args.min_retweets
            )
        return

    # Standalone export (without crawl)
    if args.export is not None and not (args.user or args.x_list or args.search or args.fetch_only or args.report_only):
        export_cmd(
            limit=args.export,
            output_path=args.output,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets
        )
        return

    pipeline = Pipeline()

    if args.trends:
        await pipeline.show_trends(
            category=args.category,
            top=args.top,
            timeout=args.timeout
        )
        return

    if args.trends_digest:
        await pipeline.run_trends_digest(
            category=args.category,
            top=args.top,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets,
            provider=args.provider,
            auth_mode=args.auth_mode,
            model=args.model,
            timeout=args.timeout
        )
        return

    if args.search:
        tweets = await pipeline.fetch_search_and_store(
            query=args.search,
            search_type=args.search_type,
            limit=args.limit,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets,
            timeout=args.timeout
        )
        if tweets:
            type_label = "实时最新" if args.search_type == "live" else "热门"
            render_tweets_table(tweets, f"搜索 '{args.search}' ({type_label}) 结果 (展示 {len(tweets)} 条)")
        else:
            console.print(f"[yellow]⚠️ 未检索到符合条件的推文（搜索词: '{args.search}'）。[/yellow]")
        if args.export is not None:
            export_cmd(
                limit=args.export,
                output_path=args.output,
                min_likes=args.min_likes,
                min_retweets=args.min_retweets
            )
        return

    if args.user:
        clean_user = args.user.lstrip("@").strip()
        tweets = await pipeline.fetch_user_and_store(clean_user, limit=args.limit, timeout=args.timeout)
        if tweets:
            render_tweets_table(tweets, f"博主 @{clean_user} 最新推文 (共拉取 {len(tweets)} 条)")
        else:
            console.print(f"[yellow]⚠️ 未能获取到 @{clean_user} 的推文，请确认账号名是否正确或该账号是否有公开推文。[/yellow]")
        if args.export is not None:
            export_cmd(
                limit=args.export,
                output_path=args.output,
                min_likes=args.min_likes,
                min_retweets=args.min_retweets
            )
        return

    if args.x_list:
        try:
            tweets = await pipeline.fetch_list_and_store(args.x_list, limit=args.limit, timeout=args.timeout)
            if tweets:
                render_tweets_table(tweets, f"X 列表推文 (共拉取 {len(tweets)} 条)")
            else:
                console.print(f"[yellow]⚠️ 未能获取到该列表推文。请确认列表 ID/URL 是否正确，且当前账号有权访问（如为私有列表需属于当前登录账号）。[/yellow]")
        except Exception as e:
            console.print(f"[bold red]❌ 列表抓取失败: {e}[/bold red]")
        if args.export is not None:
            export_cmd(
                limit=args.export,
                output_path=args.output,
                min_likes=args.min_likes,
                min_retweets=args.min_retweets
            )
        return

    if args.fetch_only:
        await pipeline.fetch_and_store(max_pages=args.pages, timeout=args.timeout)
        if args.export is not None:
            export_cmd(
                limit=args.export,
                output_path=args.output,
                min_likes=args.min_likes,
                min_retweets=args.min_retweets
            )
        return

    if args.report_only:
        pipeline.generate_report(
            hours=args.hours,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets,
            provider=args.provider,
            auth_mode=args.auth_mode,
            model=args.model,
        )
        return

    # Default: Run full pipeline
    await pipeline.run_daily(
        max_pages=args.pages,
        hours=args.hours,
        min_likes=args.min_likes,
        min_retweets=args.min_retweets,
        provider=args.provider,
        auth_mode=args.auth_mode,
        model=args.model,
        timeout=args.timeout
    )
    if args.export is not None:
        export_cmd(
            limit=args.export,
            output_path=args.output,
            min_likes=args.min_likes,
            min_retweets=args.min_retweets
        )


if __name__ == "__main__":
    asyncio.run(main())
