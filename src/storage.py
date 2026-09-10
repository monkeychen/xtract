import sqlite3
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from .config import Config


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

    def get_unsummarized_tweets(self, hours: int = 24, limit: int = 150) -> list[dict[str, Any]]:
        """
        Retrieves tweets fetched within the last N hours for summarization.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                WHERE fetched_at >= ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (cutoff, limit))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_total_count(self) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM tweets")
            return cursor.fetchone()[0]

    def get_recent_tweets(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        """Retrieves recent tweets ordered by created_at DESC."""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM tweets
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (limit, offset))
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

    def export_markdown(self, output_file: Path | None = None, limit: int = 200) -> Path:
        """Exports stored tweets to a structured, human-readable Markdown file."""
        tweets = self.get_recent_tweets(limit=limit)
        today = datetime.now().strftime("%Y-%m-%d")
        file_path = output_file or (Config.PROJECT_ROOT / "output" / f"tweets_{today}.md")
        file_path.parent.mkdir(parents=True, exist_ok=True)

        lines = [
            f"# 📚 X 关注流推文存档 ({today})",
            f"\n> 本地数据库共计 **{self.get_total_count()}** 条推文，本文件展示最近 **{len(tweets)}** 条。\n",
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

            lines.append("\n---\n")

        with open(file_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        return file_path
