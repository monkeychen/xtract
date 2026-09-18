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

        # Test get_recent_tweets with limit
        paged = storage.get_recent_tweets(limit=2)
        assert len(paged) == 2

        # Test get_tweet_by_id
        t = storage.get_tweet_by_id("1001")
        assert t is not None
        assert t["author_name"] == "Alice"
        assert storage.get_tweet_by_id("non_existent") is None

        # Test get_tweets_by_user
        alice_tweets = storage.get_tweets_by_user("alice")
        assert len(alice_tweets) == 1
        assert alice_tweets[0]["author_username"] == "alice"

        # Case-insensitive and leading @ symbol handling
        alice_tweets_at = storage.get_tweets_by_user("@ALICE")
        assert len(alice_tweets_at) == 1
        assert alice_tweets_at[0]["tweet_id"] == "1001"

        non_user_tweets = storage.get_tweets_by_user("unknown_user")
        assert len(non_user_tweets) == 0

        # Test export_markdown
        out_file = Path(tmpdir) / "test_export.md"
        exported_path = storage.export_markdown(output_file=out_file)
        assert exported_path.exists()
        content = exported_path.read_text(encoding="utf-8")
        assert "Alice" in content
        assert "1001" in content

        # Test export_single_tweet_markdown without downloading images
        single_md, dl_count = storage.export_single_tweet_markdown(
            "1002",
            output_path=Path(tmpdir) / "single.md",
            download_images=False
        )
        assert single_md.exists()
        assert dl_count == 0
        single_content = single_md.read_text(encoding="utf-8")
        assert "Bob" in single_content
        assert "1002" in single_content
        assert "转推自 @charlie" in single_content
        assert "https://example.com/img.jpg" in single_content
