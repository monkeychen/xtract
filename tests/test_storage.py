import tempfile
from pathlib import Path
from src.storage import Storage


def test_storage_init_and_deduplication():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_tweets.db"
        storage = Storage(db_path=db_path)

        sample_tweets = [
            {
                "tweet_id": "1001",
                "author_id": "user1",
                "author_name": "Alice",
                "author_username": "alice",
                "text": "Hello world from Alice",
                "created_at": "2026-09-10T08:00:00Z",
                "is_retweet": False,
                "is_quote": False,
                "like_count": 10,
                "retweet_count": 2,
                "reply_count": 1,
                "view_count": 100,
                "urls": ["https://example.com/a"],
                "media_urls": [],
            },
            {
                "tweet_id": "1002",
                "author_id": "user2",
                "author_name": "Bob",
                "author_username": "bob",
                "text": "Hello world from Bob",
                "created_at": "2026-09-10T08:30:00Z",
                "is_retweet": True,
                "retweeted_author": "charlie",
                "retweeted_text": "Original tweet from Charlie",
                "is_quote": False,
                "like_count": 5,
                "retweet_count": 0,
                "reply_count": 0,
                "view_count": 50,
                "urls": [],
                "media_urls": ["https://example.com/img.jpg"],
            },
        ]

        # First insert: 2 inserted, 0 skipped
        inserted, skipped = storage.save_tweets(sample_tweets)
        assert inserted == 2
        assert skipped == 0
        assert storage.get_total_count() == 2

        # Second insert with 1 existing and 1 new: 1 inserted, 1 skipped
        new_batch = [
            sample_tweets[0],  # duplicate
            {
                "tweet_id": "1003",
                "author_id": "user3",
                "author_name": "David",
                "author_username": "david",
                "text": "New tweet from David",
                "created_at": "2026-09-10T09:00:00Z",
            }
        ]
        inserted, skipped = storage.save_tweets(new_batch)
        assert inserted == 1
        assert skipped == 1
        assert storage.get_total_count() == 3

        # Query recent tweets
        recent = storage.get_unsummarized_tweets(hours=24)
        assert len(recent) == 3
        ids = [t["tweet_id"] for t in recent]
        assert "1001" in ids
        assert "1002" in ids
        assert "1003" in ids
