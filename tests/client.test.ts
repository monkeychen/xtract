import { describe, it, expect } from 'vitest';
import {
  parseTweetResult,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
} from '../src/main/client/parser.js';

describe('Client Parser Module', () => {
  it('test_parse_tweet_result_standard', () => {
    const rawTweet = {
      rest_id: '1234567890',
      core: {
        user_results: {
          result: {
            rest_id: '999',
            core: {
              name: 'Alice Dev',
              screen_name: 'alicedev',
            },
          },
        },
      },
      legacy: {
        full_text: 'Hello world from Xtract!',
        created_at: 'Fri Mar 27 10:00:00 +0000 2026',
        favorite_count: 42,
        retweet_count: 7,
        reply_count: 3,
        entities: {
          urls: [{ expanded_url: 'https://github.com/monkeychen/xtract' }],
          media: [{ media_url_https: 'https://pbs.twimg.com/media/pic1.jpg' }],
        },
      },
      views: {
        count: '1500',
      },
    };

    const tweet = parseTweetResult(rawTweet);
    expect(tweet).not.toBeNull();
    expect(tweet?.tweet_id).toBe('1234567890');
    expect(tweet?.author_name).toBe('Alice Dev');
    expect(tweet?.author_username).toBe('alicedev');
    expect(tweet?.text).toBe('Hello world from Xtract!');
    expect(tweet?.like_count).toBe(42);
    expect(tweet?.retweet_count).toBe(7);
    expect(tweet?.view_count).toBe(1500);
    expect(tweet?.urls).toEqual(['https://github.com/monkeychen/xtract']);
    expect(tweet?.media_urls).toEqual(['https://pbs.twimg.com/media/pic1.jpg']);
  });

  it('test_parse_tweet_result_long_tweet_and_video', () => {
    const longTweetPayload = {
      rest_id: '9999999999',
      core: {
        user_results: {
          result: {
            core: {
              name: 'Engineering Lead',
              screen_name: 'eng_lead',
            },
          },
        },
      },
      legacy: {
        full_text: 'Short truncated preview... https://t.co/xyz',
        created_at: 'Thu Sep 10 08:00:00 +0000 2026',
        extended_entities: {
          media: [
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/video_thumb/123.jpg',
              video_info: {
                variants: [
                  { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/stream.m3u8' },
                  { bitrate: 832000, content_type: 'video/mp4', url: 'https://video.twimg.com/vid_low.mp4' },
                  { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/vid_high.mp4' },
                ],
              },
            },
          ],
        },
      },
      note_tweet: {
        note_tweet_results: {
          result: {
            text: 'This is a very long post with thousands of words explaining the entire engineering architecture...',
          },
        },
      },
    };

    const parsed = parseTweetResult(longTweetPayload);
    expect(parsed).not.toBeNull();
    // 1. Full text is extracted from note_tweet, not the truncated legacy text
    expect(parsed?.text).toBe(
      'This is a very long post with thousands of words explaining the entire engineering architecture...'
    );
    // 2. Both video thumbnail and highest-bitrate MP4 direct link are extracted
    expect(parsed?.media_urls).toContain('https://pbs.twimg.com/video_thumb/123.jpg');
    expect(parsed?.media_urls).toContain('https://video.twimg.com/vid_high.mp4');
    expect(parsed?.media_urls).not.toContain('https://video.twimg.com/vid_low.mp4');
  });

  it('test_parse_timeline_instructions', () => {
    const instructions = [
      {
        type: 'TimelineAddEntries',
        entries: [
          {
            content: {
              itemContent: {
                tweet_results: {
                  result: {
                    rest_id: '88888',
                    core: {
                      user_results: {
                        result: {
                          legacy: { name: 'Test', screen_name: 'test' },
                        },
                      },
                    },
                    legacy: {
                      full_text: 'Sample tweet in timeline',
                      created_at: 'Thu Sep 10 08:30:00 +0000 2026',
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ];

    const tweets = parseTimelineInstructions(instructions);
    expect(tweets.length).toBe(1);
    expect(tweets[0].tweet_id).toBe('88888');
    expect(tweets[0].text).toBe('Sample tweet in timeline');
  });

  it('test_extract_timeline_instructions', () => {
    // List structure
    const listPayload = {
      data: {
        list: {
          tweets_timeline: {
            timeline: {
              instructions: [{ type: 'TimelineAddEntries', entries: [] }],
            },
          },
        },
      },
    };
    const extractedList = extractTimelineInstructions(listPayload);
    expect(extractedList.length).toBe(1);
    expect(extractedList[0].type).toBe('TimelineAddEntries');

    // Search structure
    const searchPayload = {
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [{ type: 'TimelineAddEntries', entries: [] }],
            },
          },
        },
      },
    };
    const extractedSearch = extractTimelineInstructions(searchPayload);
    expect(extractedSearch.length).toBe(1);
    expect(extractedSearch[0].type).toBe('TimelineAddEntries');

    // Fallback arbitrary nested structure
    const fallbackPayload = {
      random_key: {
        nested: {
          instructions: [{ type: 'TimelinePinEntry' }],
        },
      },
    };
    const extractedFallback = extractTimelineInstructions(fallbackPayload);
    expect(extractedFallback.length).toBe(1);
    expect(extractedFallback[0].type).toBe('TimelinePinEntry');
  });

  it('test_parse_trends_from_graphql', () => {
    const payload = {
      data: {
        timeline: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  content: {
                    itemContent: {
                      __typename: 'TimelineTrend',
                      name: 'Claude 3.7',
                      rank: '1',
                      trend_metadata: {
                        domain_context: 'Technology · Trending',
                        meta_description: '120K posts',
                        url: {
                          url: 'twitter://search?query=%22Claude+3.7%22',
                        },
                      },
                    },
                  },
                },
                {
                  content: {
                    itemContent: {
                      __typename: 'TimelineTrend',
                      name: 'Sponsored Brand Ad',
                      promoted_metadata: { advertiser_name: 'AdCorp' },
                      trend_metadata: {
                        domain_context: 'Promoted by AdCorp',
                        meta_description: 'Promoted by AdCorp',
                      },
                    },
                  },
                },
                {
                  content: {
                    itemContent: {
                      __typename: 'TimelineTrend',
                      name: 'DeepSeek V3',
                      rank: '2',
                      trend_metadata: {
                        domain_context: 'Artificial Intelligence',
                        meta_description: '85K posts',
                        url: {
                          url: 'twitter://search?query=DeepSeek+V3',
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const trends = parseTrendsFromGraphQL(payload);
    expect(trends.length).toBe(2);
    expect(trends[0].name).toBe('Claude 3.7');
    expect(trends[0].query).toBe('Claude 3.7');
    expect(trends[0].domain).toBe('Technology · Trending');
    expect(trends[0].tweet_count).toBe('120K posts');
    expect(trends[0].rank).toBe(1);

    expect(trends[1].name).toBe('DeepSeek V3');
    expect(trends[1].query).toBe('DeepSeek V3');
    expect(trends[1].rank).toBe(2);
  });

  it('test_extract_lists_from_graphql', async () => {
    const { extractListsFromGraphQL } = await import('../src/main/client/parser.js');
    const mockListPayload = {
      data: {
        viewer: {
          list_memberships: {
            timeline: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      entryId: 'list-1682802314011197441',
                      content: {
                        itemContent: {
                          list: {
                            id_str: '1682802314011197441',
                            name: 'AI & Tech Creators',
                            description: 'Verified Creators',
                            member_count: 710,
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };

    const lists = extractListsFromGraphQL(mockListPayload);
    expect(lists.length).toBe(1);
    expect(lists[0].id).toBe('1682802314011197441');
    expect(lists[0].name).toBe('AI & Tech Creators');
    expect(lists[0].member_count).toBe(710);
  });

  it('test_clean_user_lists_filters_out_legacy_mock_ids', async () => {
    const { Config } = await import('../src/main/config.js');
    const lists = Config.getUserLists();
    expect(lists.length).toBeGreaterThan(0);
    // Legacy mock fake IDs must be completely filtered out
    expect(lists.some((l) => l.id === '1827364512938')).toBe(false);
    expect(lists.some((l) => l.id === '1827364512939')).toBe(false);
    // Default verified list must be present
    expect(lists.some((l) => l.id === '1682802314011197441')).toBe(true);
  });
});
