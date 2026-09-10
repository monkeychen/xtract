from unittest.mock import MagicMock
from src.client import extract_tweet_data


def test_extract_tweet_data():
    mock_user = MagicMock()
    mock_user.id = "42"
    mock_user.name = "Ada Lovelace"
    mock_user.screen_name = "adalovelace"

    mock_tweet = MagicMock()
    mock_tweet.id = 99999
    mock_tweet.user = mock_user
    mock_tweet.full_text = "This is a full tweet text with #ai"
    mock_tweet.created_at = "Thu Sep 10 01:00:00 +0000 2026"
    mock_tweet.retweeted_tweet = None
    mock_tweet.is_quote_status = False
    mock_tweet.quote = None
    mock_tweet.favorite_count = 88
    mock_tweet.retweet_count = 12
    mock_tweet.reply_count = 5
    mock_tweet.view_count = 1200
    mock_tweet.urls = [{"expanded_url": "https://anthropic.com"}]
    mock_tweet.media = [{"media_url_https": "https://pbs.twimg.com/media/test.jpg"}]

    data = extract_tweet_data(mock_tweet)

    assert data["tweet_id"] == "99999"
    assert data["author_id"] == "42"
    assert data["author_name"] == "Ada Lovelace"
    assert data["author_username"] == "adalovelace"
    assert data["text"] == "This is a full tweet text with #ai"
    assert data["like_count"] == 88
    assert data["retweet_count"] == 12
    assert data["urls"] == ["https://anthropic.com"]
    assert data["media_urls"] == ["https://pbs.twimg.com/media/test.jpg"]
    assert not data["is_retweet"]
    assert not data["is_quote"]
