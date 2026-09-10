import argparse
import asyncio
import sys
from rich.console import Console
from rich.panel import Panel
from src.config import Config
from src.client import XClient
from src.pipeline import Pipeline

console = Console()


async def check_auth_cmd() -> None:
    console.print("[cyan]🔍 正在验证 X 登录状态与 Cookie 有效性...[/cyan]")
    if not Config.validate_x_credentials():
        console.print(
            "[bold red]❌ 未配置认证凭据。[/bold red]\n"
            "建议方式：\n"
            "1. 运行 `uv run python main.py --login` 弹出浏览器窗口直接登录（最省心，自动持久化凭证）。\n"
            "2. 或在 `.env` 中填写 `X_AUTH_TOKEN` 和 `X_CT0`。"
        )
        sys.exit(1)

    client = XClient()
    try:
        user_info = await client.verify_auth()
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

    args = parser.parse_args()

    if args.login:
        client = XClient()
        await client.login_interactive()
        return

    if args.check_auth:
        await check_auth_cmd()
        return

    pipeline = Pipeline()

    if args.fetch_only:
        await pipeline.fetch_and_store(max_pages=args.pages)
        return

    if args.report_only:
        pipeline.generate_report(hours=args.hours)
        return

    # Default: Run full pipeline
    await pipeline.run_daily(max_pages=args.pages, hours=args.hours)


if __name__ == "__main__":
    asyncio.run(main())
