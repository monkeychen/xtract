import asyncio
import logging
from typing import Any
from twikit import Client
from .config import Config

logger = logging.getLogger(__name__)


def extract_tweet_data(tweet: Any) -> dict[str, Any]:
    author = getattr(tweet, "user", None)
    author_id = getattr(author, "id", "") if author else ""
    author_name = getattr(author, "name", "") if author else ""
    author_username = getattr(author, "screen_name", "") if author else ""

    is_retweet = bool(getattr(tweet, "retweeted_tweet", None))
    retweeted_author = ""
    retweeted_text = ""
    if is_retweet and tweet.retweeted_tweet:
        rt_user = getattr(tweet.retweeted_tweet, "user", None)
        retweeted_author = getattr(rt_user, "screen_name", "") if rt_user else ""
        retweeted_text = getattr(tweet.retweeted_tweet, "full_text", None) or getattr(
            tweet.retweeted_tweet, "text", ""
        )

    is_quote = bool(getattr(tweet, "is_quote_status", False)) and bool(getattr(tweet, "quote", None))
    quoted_author = ""
    quoted_text = ""
    if is_quote and tweet.quote:
        q_user = getattr(tweet.quote, "user", None)
        quoted_author = getattr(q_user, "screen_name", "") if q_user else ""
        quoted_text = getattr(tweet.quote, "full_text", None) or getattr(tweet.quote, "text", "")

    media_urls = []
    if getattr(tweet, "media", None):
        for m in tweet.media:
            if isinstance(m, dict) and "media_url_https" in m:
                media_urls.append(m["media_url_https"])
            elif hasattr(m, "media_url_https"):
                media_urls.append(getattr(m, "media_url_https"))

    urls = []
    if getattr(tweet, "urls", None):
        for u in tweet.urls:
            if isinstance(u, dict) and "expanded_url" in u:
                urls.append(u["expanded_url"])
            elif isinstance(u, str):
                urls.append(u)

    full_text = getattr(tweet, "full_text", None) or getattr(tweet, "text", "")

    return {
        "tweet_id": str(tweet.id),
        "author_id": str(author_id),
        "author_name": author_name,
        "author_username": author_username,
        "text": full_text,
        "created_at": getattr(tweet, "created_at", ""),
        "is_retweet": is_retweet,
        "retweeted_author": retweeted_author,
        "retweeted_text": retweeted_text,
        "is_quote": is_quote,
        "quoted_author": quoted_author,
        "quoted_text": quoted_text,
        "like_count": getattr(tweet, "favorite_count", 0) or 0,
        "retweet_count": getattr(tweet, "retweet_count", 0) or 0,
        "reply_count": getattr(tweet, "reply_count", 0) or 0,
        "view_count": getattr(tweet, "view_count", 0) or 0,
        "urls": urls,
        "media_urls": media_urls,
    }


class XClient:
    def __init__(self) -> None:
        self.client = Client(language="zh-CN")
        self._authenticated = False

    def setup_cookies(self) -> None:
        if not Config.validate_x_credentials():
            raise ValueError("X_AUTH_TOKEN or X_CT0 is missing in .env configuration.")
        self.client.set_cookies({
            "auth_token": Config.X_AUTH_TOKEN,
            "ct0": Config.X_CT0,
        })
        self._authenticated = True

    async def verify_auth(self) -> dict[str, str]:
        """
        Verifies if credentials are valid by querying the current user.
        Returns basic user info if successful.
        """
        if not self._authenticated:
            self.setup_cookies()
        try:
            current_user = await self.client.user()
            return {
                "id": str(current_user.id),
                "name": current_user.name,
                "screen_name": current_user.screen_name,
            }
        except Exception as e:
            raise RuntimeError(f"X authentication failed: {e}. Check if auth_token or ct0 expired.") from e

    async def fetch_following_timeline(
        self,
        max_pages: int = 3,
        page_delay: float = 2.0
    ) -> list[dict[str, Any]]:
        """
        Fetches tweets from Following timeline (HomeLatestTimeline).
        """
        if not self._authenticated:
            self.setup_cookies()

        all_tweets: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        batch = await self.client.get_latest_timeline(count=20)
        pages_fetched = 0

        while batch and pages_fetched < max_pages:
            pages_fetched += 1
            current_batch_tweets = []
            for item in batch:
                tweet_data = extract_tweet_data(item)
                t_id = tweet_data["tweet_id"]
                if t_id not in seen_ids:
                    seen_ids.add(t_id)
                    all_tweets.append(tweet_data)
                    current_batch_tweets.append(tweet_data)

            if pages_fetched < max_pages:
                await asyncio.sleep(page_delay)
                try:
                    batch = await batch.next()
                except Exception as e:
                    logger.warning(f"Error fetching next page of timeline: {e}")
                    break

        return all_tweets
