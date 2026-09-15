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


def test_parse_tweet_long_form_and_video():
    long_tweet_payload = {
        "rest_id": "77777",
        "core": {
            "user_results": {
                "result": {
                    "core": {"name": "Builder", "screen_name": "builder"}
                }
            }
        },
        "legacy": {
            "full_text": "Short truncated preview... https://t.co/xyz",
            "created_at": "Thu Sep 10 08:00:00 +0000 2026",
            "extended_entities": {
                "media": [
                    {
                        "type": "video",
                        "media_url_https": "https://pbs.twimg.com/video_thumb/123.jpg",
                        "video_info": {
                            "variants": [
                                {"content_type": "application/x-mpegURL", "url": "https://video.twimg.com/stream.m3u8"},
                                {"bitrate": 832000, "content_type": "video/mp4", "url": "https://video.twimg.com/vid_low.mp4"},
                                {"bitrate": 2176000, "content_type": "video/mp4", "url": "https://video.twimg.com/vid_high.mp4"},
                            ]
                        }
                    }
                ]
            }
        },
        "note_tweet": {
            "note_tweet_results": {
                "result": {
                    "text": "This is a very long post with thousands of words explaining the entire engineering architecture..."
                }
            }
        }
    }

    parsed = parse_tweet_result(long_tweet_payload)
    assert parsed is not None
    # 1. Full text is extracted from note_tweet, not the truncated legacy text
    assert parsed["text"] == "This is a very long post with thousands of words explaining the entire engineering architecture..."
    # 2. Both video thumbnail and highest-bitrate MP4 direct link are extracted
    assert "https://pbs.twimg.com/video_thumb/123.jpg" in parsed["media_urls"]
    assert "https://video.twimg.com/vid_high.mp4" in parsed["media_urls"]


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
