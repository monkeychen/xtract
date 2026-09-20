import sqlite3
import json
import re
import urllib.parse
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
import httpx
from .config import Config

logger = logging.getLogger(__name__)


def is_video_url(url: str) -> bool:
    """Checks if a URL points to a video or streaming media."""
    lower = url.lower()
    return ".mp4" in lower or ".m3u8" in lower or "video.twimg.com" in lower


def download_image(
    url: str,
    dest_path: Path,
    client: httpx.Client | None = None,
    timeout: float = 15.0
) -> bool:
    """
    Downloads an image from url to dest_path.
    Skips downloading if the file already exists and is not empty.
    """
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return True

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        "Referer": "https://x.com/",
    }

    close_client = False
    if client is None:
        client = httpx.Client(
            proxy=Config.HTTP_PROXY or None,
            headers=headers,
            timeout=timeout,
            follow_redirects=True
        )
        close_client = True

    try:
        resp = client.get(url)
        if resp.status_code == 200 and len(resp.content) > 0:
            dest_path.write_bytes(resp.content)
            return True
        else:
            logger.warning(f"Failed to download image {url}: HTTP {resp.status_code}")
            return False
    except Exception as e:
        logger.warning(f"Error downloading image {url}: {e}")
        return False
    finally:
        if close_client:
            client.close()


class Storage:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or Config.DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tweets (
                    tweet_id TEXT PRIMARY KEY,
                    author_id TEXT,
                    author_name TEXT,
                    author_username TEXT,
                    text TEXT NOT NULL,
                    created_at TEXT,
                    is_retweet INTEGER DEFAULT 0,
                    retweeted_author TEXT,
                    retweeted_text TEXT,
                    is_quote INTEGER DEFAULT 0,
                    quoted_author TEXT,
                    quoted_text TEXT,
                    like_count INTEGER DEFAULT 0,
                    retweet_count INTEGER DEFAULT 0,
                    reply_count INTEGER DEFAULT 0,
                    view_count INTEGER DEFAULT 0,
                    urls TEXT,
                    media_urls TEXT,
                    fetched_at TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON tweets(created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_fetched_at ON tweets(fetched_at)")
            conn.commit()

    def save_tweets(self, tweets: list[dict[str, Any]]) -> tuple[int, int]:
        """
        Saves tweets to the database.
        Returns: (inserted_count, skipped_count)
        """
        inserted = 0
        skipped = 0
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._get_connection() as conn:
            for item in tweets:
                try:
                    conn.execute("""
                        INSERT INTO tweets (
                            tweet_id, author_id, author_name, author_username,
                            text, created_at, is_retweet, retweeted_author, retweeted_text,
                            is_quote, quoted_author, quoted_text, like_count, retweet_count,
                            reply_count, view_count, urls, media_urls, fetched_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        item.get("tweet_id"),
                        item.get("author_id"),
                        item.get("author_name"),
                        item.get("author_username"),
                        item.get("text"),
                        item.get("created_at"),
                        1 if item.get("is_retweet") else 0,
                        item.get("retweeted_author"),
                        item.get("retweeted_text"),
                        1 if item.get("is_quote") else 0,
                        item.get("quoted_author"),
                        item.get("quoted_text"),
                        item.get("like_count", 0),
                        item.get("retweet_count", 0),
                        item.get("reply_count", 0),
                        item.get("view_count", 0),
                        json.dumps(item.get("urls", [])),
                        json.dumps(item.get("media_urls", [])),
                        now_iso
                    ))
                    inserted += 1
                except sqlite3.IntegrityError:
                    skipped += 1
            conn.commit()

        return inserted, skipped

    def get_unsummarized_tweets(
        self,
        hours: int = 24,
        limit: int = 150,
        min_likes: int = 0,
        min_retweets: int = 0
    ) -> list[dict[str, Any]]:
        """
        Retrieves tweets fetched within the last N hours for summarization.
        Supports filtering by minimum like and retweet thresholds.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                WHERE fetched_at >= ? AND like_count >= ? AND retweet_count >= ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (cutoff, min_likes, min_retweets, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_total_count(self) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM tweets")
            return cursor.fetchone()[0]

    def get_recent_tweets(
        self,
        limit: int = 50,
        offset: int = 0,
        min_likes: int = 0,
        min_retweets: int = 0
    ) -> list[dict[str, Any]]:
        """Retrieves recent tweets ordered by created_at DESC with optional engagement filters."""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                WHERE like_count >= ? AND retweet_count >= ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (min_likes, min_retweets, limit, offset))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_tweet_by_id(self, tweet_id: str) -> dict[str, Any] | None:
        """Retrieves a single tweet by its tweet_id."""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                WHERE tweet_id = ?
            """, (tweet_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_tweets_by_user(
        self,
        username: str,
        limit: int = 50,
        min_likes: int = 0,
        min_retweets: int = 0
    ) -> list[dict[str, Any]]:
        """Retrieves recent tweets by author username (case-insensitive) with engagement filters."""
        clean_name = username.lstrip("@").strip()
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                WHERE LOWER(author_username) = LOWER(?) AND like_count >= ? AND retweet_count >= ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (clean_name, min_likes, min_retweets, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def export_markdown(
        self,
        output_file: Path | None = None,
        limit: int = 200,
        min_likes: int = 0,
        min_retweets: int = 0
    ) -> Path:
        """Exports stored tweets to a structured, human-readable Markdown file."""
        tweets = self.get_recent_tweets(limit=limit, min_likes=min_likes, min_retweets=min_retweets)
        today = datetime.now().strftime("%Y-%m-%d")
        file_path = output_file or (Config.PROJECT_ROOT / "output" / f"tweets_{today}.md")
        if file_path.is_dir():
            file_path = file_path / f"tweets_{today}.md"
        file_path.parent.mkdir(parents=True, exist_ok=True)

        filter_desc = []
        if min_likes > 0:
            filter_desc.append(f"赞数 ≥ {min_likes}")
        if min_retweets > 0:
            filter_desc.append(f"转发 ≥ {min_retweets}")
        filter_str = f"（筛选: {', '.join(filter_desc)}）" if filter_desc else ""

        lines = [
            f"# 📚 X 推文存档 ({today})",
            f"\n> 本地数据库共计 **{self.get_total_count()}** 条推文，本文件展示符合条件的最近 **{len(tweets)}** 条推文{filter_str}。\n",
            "---\n",
        ]

        for idx, t in enumerate(tweets, 1):
            name = t.get("author_name") or "Unknown"
            username = t.get("author_username") or "unknown"
            t_id = t.get("tweet_id")
            time_str = t.get("created_at") or ""
            likes = t.get("like_count", 0)
            rts = t.get("retweet_count", 0)
            views = t.get("view_count", 0)
            text = t.get("text", "").strip()

            url_twitter = f"https://x.com/{username}/status/{t_id}"

            lines.append(f"### {idx}. [{name} (@{username})]({url_twitter})")
            lines.append(f"- **发布时间**: `{time_str}` | **互动**: ❤️ `{likes}`  🔁 `{rts}`  👁️ `{views}` | **ID**: `{t_id}`")
            lines.append(f"\n{text}\n")

            if t.get("is_retweet"):
                lines.append(f"> 🔁 **转推自 @{t.get('retweeted_author')}**:\n> {t.get('retweeted_text')}\n")
            elif t.get("is_quote"):
                lines.append(f"> 💬 **引用推文 @{t.get('quoted_author')}**:\n> {t.get('quoted_text')}\n")

            try:
                urls = json.loads(t.get("urls") or "[]")
                if urls:
                    lines.append("- 🔗 包含链接: " + ", ".join([f"[{u}]({u})" for u in urls]))
            except Exception:
                pass

            try:
                media = json.loads(t.get("media_urls") or "[]")
                if media:
                    lines.append("- 🖼️ 媒体附件: " + ", ".join([f"[附件 {i}]({m})" for i, m in enumerate(media, 1)]))
            except Exception:
                pass

            lines.append("\n---\n")

        with open(file_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        return file_path

    def get_thread_tweets(self, tweet_id: str) -> list[dict[str, Any]]:
        """
        Retrieves all tweets belonging to the same thread batch as tweet_id.
        Matches author_username and identical fetched_at timestamp.
        """
        t = self.get_tweet_by_id(tweet_id)
        if not t:
            return []
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                WHERE LOWER(author_username) = LOWER(?) AND fetched_at = ?
                ORDER BY tweet_id ASC
            """, (t["author_username"], t["fetched_at"]))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def export_single_tweet_markdown(
        self,
        tweet_id: str,
        output_path: str | Path | None = None,
        download_images: bool = True
    ) -> tuple[Path, int]:
        """
        Exports a single tweet (or author thread series) to an independent Markdown document.
        - When download_images is True, saves images to <md_dir>/images/ and embeds relative paths.
        - Videos are retained as direct accessible web links without downloading binaries.
        Returns: (file_path, downloaded_images_count)
        """
        primary_tweet = self.get_tweet_by_id(tweet_id)
        if not primary_tweet:
            raise ValueError(f"推文 ID `{tweet_id}` 不存在于本地数据库中。")

        thread_tweets = self.get_thread_tweets(tweet_id)
        all_tweets = thread_tweets if thread_tweets else [primary_tweet]

        author_user = primary_tweet.get("author_username", "unknown")
        if output_path:
            p = Path(output_path).expanduser().resolve()
            if p.is_dir() or p.suffix.lower() not in (".md", ".markdown"):
                md_dir = p
                md_file = md_dir / f"tweet_{primary_tweet['tweet_id']}_{author_user}.md"
            else:
                md_file = p
                md_dir = md_file.parent
        else:
            md_dir = Config.PROJECT_ROOT / "output"
            md_file = md_dir / f"tweet_{primary_tweet['tweet_id']}_{author_user}.md"

        md_dir.mkdir(parents=True, exist_ok=True)
        primary_id = str(primary_tweet["tweet_id"])
        tweet_images_dir = md_dir / "images" / primary_id
        if download_images:
            tweet_images_dir.mkdir(parents=True, exist_ok=True)

        downloaded_count = 0

        def process_media(t_item: dict[str, Any], client: httpx.Client | None, is_primary: bool = True) -> tuple[list[str], list[str]]:
            nonlocal downloaded_count
            media_list = []
            try:
                media_list = json.loads(t_item.get("media_urls") or "[]")
            except Exception:
                pass

            img_md_links = []
            vid_links = []
            t_id = str(t_item.get("tweet_id", "media"))

            for idx, m_url in enumerate(media_list, 1):
                if is_video_url(m_url):
                    vid_links.append(m_url)
                else:
                    if download_images and client:
                        parsed = urllib.parse.urlparse(m_url)
                        clean_path = parsed.path
                        orig_name = Path(clean_path).name
                        ext = Path(orig_name).suffix.lower()
                        if not ext or ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                            qs = urllib.parse.parse_qs(parsed.query)
                            if "format" in qs:
                                ext = f".{qs['format'][0].lower()}"
                            else:
                                ext = ".jpg"
                        raw_stem = Path(orig_name).stem
                        clean_stem = re.sub(r"[^\w\-_\.]", "_", raw_stem)[:30] or f"img_{idx}"
                        if is_primary:
                            local_name = f"{idx}_{clean_stem}{ext}"
                        else:
                            local_name = f"{t_id}_{idx}_{clean_stem}{ext}"
                        local_path = tweet_images_dir / local_name

                        if download_image(m_url, local_path, client=client):
                            downloaded_count += 1
                            img_md_links.append(f"![图片 {idx}](images/{primary_id}/{local_name})")
                        else:
                            img_md_links.append(f"![图片 {idx} (远程)]({m_url})")
                    else:
                        img_md_links.append(f"![图片 {idx}]({m_url})")

            return img_md_links, vid_links

        author_name = primary_tweet.get("author_name") or "Unknown"
        t_url = f"https://x.com/{author_user}/status/{primary_tweet['tweet_id']}"
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        doc_lines = [
            f"# {author_name} (@{author_user}) 的推文",
            "",
            f"> 原文发布于: `{primary_tweet.get('created_at', '未知')}` | 推文 ID: `{primary_tweet['tweet_id']}` | [在 X 上查看原文]({t_url})",
            "",
            f"- **作者**: [{author_name} (@{author_user})](https://x.com/{author_user})",
            f"- **发布时间**: `{primary_tweet.get('created_at', '未知')}`",
            f"- **互动数据**: ❤️ `{primary_tweet.get('like_count', 0)}` 赞 · 🔁 `{primary_tweet.get('retweet_count', 0)}` 转发 · 💬 `{primary_tweet.get('reply_count', 0)}` 回复 · 👁️ `{primary_tweet.get('view_count', 0)}` 浏览",
            f"- **原文链接**: {t_url}",
            "",
            "---",
            "",
            "## 📝 正文",
            "",
            primary_tweet.get("text", "").strip(),
            "",
        ]

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            "Referer": "https://x.com/",
        }

        with httpx.Client(proxy=Config.HTTP_PROXY or None, headers=headers, timeout=15.0, follow_redirects=True) as client:
            p_imgs, p_vids = process_media(primary_tweet, client if download_images else None, is_primary=True)

            if primary_tweet.get("is_retweet"):
                doc_lines.extend([
                    f"> 🔁 **转推自 @{primary_tweet.get('retweeted_author')}**:",
                    f"> {primary_tweet.get('retweeted_text')}",
                    ""
                ])
            elif primary_tweet.get("is_quote"):
                doc_lines.extend([
                    f"> 💬 **引用推文 @{primary_tweet.get('quoted_author')}**:",
                    f"> {primary_tweet.get('quoted_text')}",
                    ""
                ])

            if p_imgs:
                doc_lines.append("### 🖼️ 附图")
                doc_lines.extend(p_imgs)
                doc_lines.append("")

            if p_vids:
                doc_lines.append("### 🎬 视频链接")
                for v in p_vids:
                    doc_lines.append(f"- [点击在线观看 / 下载视频 (MP4)]({v})")
                doc_lines.append("")

            try:
                urls = json.loads(primary_tweet.get("urls") or "[]")
                if urls:
                    doc_lines.append("### 🔗 附带外链")
                    for u in urls:
                        doc_lines.append(f"- [{u}]({u})")
                    doc_lines.append("")
            except Exception:
                pass

            other_tweets = [t for t in all_tweets if str(t.get("tweet_id")) != str(primary_tweet.get("tweet_id"))]
            if other_tweets:
                doc_lines.extend([
                    "---",
                    "",
                    f"## 🧵 连帖全文 / Thread 展开 (共 {len(all_tweets)} 条)",
                    "",
                ])
                for idx, ot in enumerate(other_tweets, 2):
                    ot_url = f"https://x.com/{author_user}/status/{ot['tweet_id']}"
                    doc_lines.extend([
                        f"### 第 {idx} 条 (ID: `{ot['tweet_id']}`)",
                        f"> 发布时间: `{ot.get('created_at', '未知')}` | ❤️ `{ot.get('like_count', 0)}` · 🔁 `{ot.get('retweet_count', 0)}` | [原帖链接]({ot_url})",
                        "",
                        ot.get("text", "").strip(),
                        "",
                    ])
                    ot_imgs, ot_vids = process_media(ot, client if download_images else None, is_primary=False)
                    if ot_imgs:
                        doc_lines.append("#### 🖼️ 附图")
                        doc_lines.extend(ot_imgs)
                        doc_lines.append("")
                    if ot_vids:
                        doc_lines.append("#### 🎬 视频链接")
                        for v in ot_vids:
                            doc_lines.append(f"- [点击在线观看 / 下载视频 (MP4)]({v})")
                        doc_lines.append("")

                    try:
                        ot_urls = json.loads(ot.get("urls") or "[]")
                        if ot_urls:
                            doc_lines.append("#### 🔗 附带外链")
                            for u in ot_urls:
                                doc_lines.append(f"- [{u}]({u})")
                            doc_lines.append("")
                    except Exception:
                        pass

                    doc_lines.append("---\n")

        doc_lines.extend([
            "",
            "---",
            f"*由 X Following Timeline AI Digest 归档于 `{now_str}`*",
            ""
        ])

        with open(md_file, "w", encoding="utf-8") as f:
            f.write("\n".join(doc_lines))

        return md_file, downloaded_count
