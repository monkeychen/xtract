import { describe, it, expect } from 'vitest';
import {
  parseTweetResult,
  parseTimelineInstructions,
  extractTimelineInstructions,
  parseTrendsFromGraphQL,
} from '../src/main/client/parser.js';

describe('Client Parser Module', () => {
  it('parses standard tweet result correctly', () => {
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

  it('unwraps TweetWithVisibilityResults and supports note_tweet', () => {
    const rawWrapper = {
      __typename: 'TweetWithVisibilityResults',
      tweet: {
        rest_id: '777888',
        core: {
          user_results: {
            result: {
              legacy: { name: 'Bob', screen_name: 'bob' },
            },
          },
        },
        note_tweet: {
          note_tweet_results: {
            result: {
              text: 'This is a very long note tweet with extended analysis.',
            },
          },
        },
        legacy: {
          full_text: 'Short excerpt...',
          favorite_count: 10,
        },
      },
    };

    const tweet = parseTweetResult(rawWrapper);
    expect(tweet).not.toBeNull();
    expect(tweet?.tweet_id).toBe('777888');
    expect(tweet?.author_name).toBe('Bob');
    expect(tweet?.text).toBe('This is a very long note tweet with extended analysis.');
  });

  it('handles retweets and quotes correctly', () => {
    const rawRt = {
      rest_id: '999111',
      core: {
        user_results: {
          result: {
            legacy: { name: 'Charlie', screen_name: 'charlie' },
          },
        },
      },
      legacy: {
        full_text: 'RT @original: Original insight',
        is_quote_status: true,
        retweeted_status_result: {
          result: {
            legacy: { full_text: 'Original insight' },
            core: {
              user_results: {
                result: {
                  legacy: { screen_name: 'original' },
                },
              },
            },
          },
        },
      },
      quoted_status_result: {
        result: {
          legacy: { full_text: 'Quoted context' },
          core: {
            user_results: {
              result: {
                legacy: { screen_name: 'quoted_user' },
              },
            },
          },
        },
      },
    };

    const tweet = parseTweetResult(rawRt);
    expect(tweet).not.toBeNull();
    expect(tweet?.is_retweet).toBe(true);
    expect(tweet?.retweeted_author).toBe('original');
    expect(tweet?.retweeted_text).toBe('Original insight');
    expect(tweet?.is_quote).toBe(true);
    expect(tweet?.quoted_author).toBe('quoted_user');
    expect(tweet?.quoted_text).toBe('Quoted context');
  });

  it('filters promoted ads and cursors from instructions', () => {
    const instructions = [
      {
        type: 'TimelineAddEntries',
        entries: [
          {
            entryId: 'tweet-101',
            content: {
              itemContent: {
                tweet_results: {
                  result: {
                    rest_id: '101',
                    legacy: { full_text: 'Legit tweet 1', favorite_count: 5 },
                  },
                },
              },
            },
          },
          {
            entryId: 'promoted-tweet-999',
            content: {
              itemContent: {
                tweet_results: {
                  result: {
                    rest_id: '999',
                    legacy: { full_text: 'Buy crypto now!' },
                  },
                },
              },
            },
          },
          {
            entryId: 'cursor-bottom-12345',
            content: {},
          },
        ],
      },
    ];

    const tweets = parseTimelineInstructions(instructions);
    expect(tweets.length).toBe(1);
    expect(tweets[0].tweet_id).toBe('101');
    expect(tweets[0].text).toBe('Legit tweet 1');
  });

  it('parses trends from GraphQL payload, filtering promoted items', () => {
    const payload = {
      data: {
        explore: {
          items: [
            {
              item: {
                itemContent: {
                  __typename: 'TimelineTrend',
                  name: 'DeepSeek V4',
                  rank: 1,
                  trend_metadata: {
                    domain_context: 'Technology',
                    meta_description: '52.3K posts',
                    url: { url: 'https://twitter.com/search?query=%22DeepSeek+V4%22&src=trend_click' },
                  },
                },
              },
            },
            {
              item: {
                itemContent: {
                  __typename: 'TimelineTrend',
                  name: 'Casino Ad',
                  rank: 2,
                  promoted_metadata: { advertiser_id: '123' },
                  trend_metadata: {
                    domain_context: 'Promoted',
                    meta_description: 'Promoted by Casino',
                  },
                },
              },
            },
          ],
        },
      },
    };

    const trends = parseTrendsFromGraphQL(payload);
    expect(trends.length).toBe(1);
    expect(trends[0].name).toBe('DeepSeek V4');
    expect(trends[0].query).toBe('DeepSeek V4');
    expect(trends[0].domain).toBe('Technology');
    expect(trends[0].rank).toBe(1);
  });
});
