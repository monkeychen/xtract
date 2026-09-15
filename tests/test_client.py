from src.client import parse_tweet_result, parse_timeline_instructions


def test_parse_tweet_result():
    mock_tweet_result = {
        "rest_id": "1234567890",
        "core": {
            "user_results": {
                "result": {
                    "rest_id": "987",
                    "legacy": {
                        "name": "Sam Altman",
                        "screen_name": "sama"
                    }
                }
            }
        },
        "legacy": {
            "full_text": "Shipping new models today.",
            "created_at": "Thu Sep 10 08:00:00 +0000 2026",
            "favorite_count": 9999,
            "retweet_count": 1200,
            "reply_count": 500,
            "entities": {
                "urls": [{"expanded_url": "https://openai.com"}],
                "media": [{"media_url_https": "https://pbs.twimg.com/media/test.jpg"}]
            }
        },
        "views": {"count": "150000"}
    }

    parsed = parse_tweet_result(mock_tweet_result)
    assert parsed is not None
    assert parsed["tweet_id"] == "1234567890"
    assert parsed["author_name"] == "Sam Altman"
    assert parsed["author_username"] == "sama"
    assert parsed["text"] == "Shipping new models today."
    assert parsed["like_count"] == 9999
    assert parsed["view_count"] == 150000
    assert parsed["urls"] == ["https://openai.com"]
    assert parsed["media_urls"] == ["https://pbs.twimg.com/media/test.jpg"]


def test_parse_timeline_instructions():
    instructions = [
        {
            "type": "TimelineAddEntries",
            "entries": [
                {
                    "content": {
                        "itemContent": {
                            "tweet_results": {
                                "result": {
                                    "rest_id": "88888",
                                    "core": {
                                        "user_results": {
                                            "result": {
                                                "legacy": {"name": "Test", "screen_name": "test"}
                                            }
                                        }
                                    },
                                    "legacy": {
                                        "full_text": "Sample tweet in timeline",
                                        "created_at": "Thu Sep 10 08:30:00 +0000 2026",
                                    }
                                }
                            }
                        }
                    }
                }
            ]
        }
    ]

    tweets = parse_timeline_instructions(instructions)
    assert len(tweets) == 1
    assert tweets[0]["tweet_id"] == "88888"
    assert tweets[0]["text"] == "Sample tweet in timeline"


def test_extract_timeline_instructions():
    from src.client import extract_timeline_instructions

    # List structure
    list_payload = {
        "data": {
            "list": {
                "tweets_timeline": {
                    "timeline": {
                        "instructions": [{"type": "TimelineAddEntries", "entries": []}]
                    }
                }
            }
        }
    }
    extracted = extract_timeline_instructions(list_payload)
    assert len(extracted) == 1
    assert extracted[0]["type"] == "TimelineAddEntries"

    # Fallback arbitrary nested structure
    fallback_payload = {
        "random_key": {
            "nested": {
                "instructions": [{"type": "TimelinePinEntry"}]
            }
        }
    }
    extracted_fallback = extract_timeline_instructions(fallback_payload)
    assert len(extracted_fallback) == 1
    assert extracted_fallback[0]["type"] == "TimelinePinEntry"
