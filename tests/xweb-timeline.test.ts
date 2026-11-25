import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import {
  classifyTweetContentType,
  extractTimelineInstructions,
  extractSsrTimelineTweetsFromHtml,
  isArticleTweet,
  parseTimelineInstructions,
  parseTweetResult,
} from '../src/main/client/parser.js';
import { fetchTweetThreadViaHttpSsr } from '../src/main/client/index.js';

describe('x-web SSR & Timeline Schema Compatibility (v0.1.4)', () => {
  it('1. parseTimelineInstructions parses x-web __typename, entry_id, content.content and module item.content', () => {
    const instructions = [
      {
        __typename: 'TimelineClearCache',
      },
      {
        __typename: 'TimelinePinEntry',
        entry: {
          entry_id: 'tweet-100001',
          content: {
            __typename: 'TimelineTimelineItem',
            content: {
              __typename: 'TimelineTweet',
              tweet_results: {
                rest_id: '100001',
                result: {
                  __typename: 'Tweet',
                  rest_id: '100001',
                  core: { user_results: { result: { rest_id: 'u1', core: { name: 'Pinned', screen_name: 'pinned_u' } } } },
                  counts: { favorite_count: 50, retweet_count: 5, reply_count: 2 },
                  details: { created_at_ms: 1795500000000, full_text: 'Pinned tweet text' },
                  legacy: { conversation_id_str: '100001' },
                },
              },
            },
          },
        },
      },
      {
        __typename: 'TimelineAddEntries',
        entries: [
          {
            entry_id: 'promoted-tweet-999',
            content: {
              content: {
                tweet_results: {
                  result: {
                    rest_id: '999',
                    details: { full_text: 'Ad should be skipped' },
                    legacy: {},
                  },
                },
              },
            },
          },
          {
            entry_id: 'cursor-bottom-123',
            content: { __typename: 'TimelineTimelineCursor', value: 'abc' },
          },
          {
            entry_id: 'tweet-200002',
            content: {
              __typename: 'TimelineTimelineItem',
              content: {
                __typename: 'TimelineTweet',
                tweet_results: {
                  rest_id: '200002',
                  result: {
                    __typename: 'Tweet',
                    rest_id: '200002',
                    core: { user_results: { result: { rest_id: 'u2', core: { name: 'Alice', screen_name: 'alice' } } } },
                    counts: { favorite_count: 120, retweet_count: 15, reply_count: 8 },
                    details: { created_at_ms: 1795501000000, full_text: 'Regular x-web timeline tweet' },
                    legacy: { conversation_id_str: '200002' },
                  },
                },
              },
            },
          },
          {
            entry_id: 'list-conversation-300003',
            content: {
              __typename: 'TimelineTimelineModule',
              items: [
                {
                  entry_id: 'list-conversation-300003-tweet-300003',
                  item: {
                    __typename: 'TimelineTimelineItem',
                    content: {
                      __typename: 'TimelineTweet',
                      tweet_results: {
                        rest_id: '300003',
                        result: {
                          __typename: 'Tweet',
                          rest_id: '300003',
                          core: { user_results: { result: { rest_id: 'u3', core: { name: 'Bob', screen_name: 'bob' } } } },
                          counts: { favorite_count: 33, retweet_count: 3, reply_count: 1 },
                          details: { created_at_ms: 1795502000000, full_text: 'Module conversation tweet' },
                          legacy: { conversation_id_str: '300003' },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ];

    const tweets = parseTimelineInstructions(instructions);
    expect(tweets.map((t) => t.tweet_id)).toEqual(['100001', '200002', '300003']);
    expect(tweets[0].author_username).toBe('pinned_u');
    expect(tweets[1].like_count).toBe(120);
    expect(tweets[2].text).toBe('Module conversation tweet');
  });

  it('2. extractTimelineInstructions & extractSsrTimelineTweetsFromHtml support x-web list_by_rest_id_v2 SSR HTML', () => {
    const payload = {
      data: {
        list_by_rest_id_v2: {
          tweets_timeline: {
            timeline: {
              instructions: [
                {
                  __typename: 'TimelineAddEntries',
                  entries: [
                    {
                      entry_id: 'tweet-555001',
                      content: {
                        content: {
                          tweet_results: {
                            result: {
                              rest_id: '555001',
                              core: { user_results: { result: { rest_id: 'u5', core: { name: 'ListAuthor', screen_name: 'list_author' } } } },
                              counts: { favorite_count: 88, retweet_count: 9, reply_count: 1 },
                              details: { created_at_ms: 1795503000000, full_text: 'SSR list tweet' },
                              legacy: {},
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
        },
      },
    };

    const inst = extractTimelineInstructions(payload);
    expect(inst.length).toBe(1);

    const esc = JSON.stringify(JSON.stringify(payload)).slice(1, -1);
    const html = `<script>$_TSR.router={result:{kind:"Result.Ok",value:"${esc}"}};</script>`;
    const ssrTweets = extractSsrTimelineTweetsFromHtml(html);
    expect(ssrTweets.length).toBe(1);
    expect(ssrTweets[0].tweet_id).toBe('555001');
    expect(ssrTweets[0].author_username).toBe('list_author');
  });

  describe('3. fetchTweetThreadViaHttpSsr fetches X Article + embedded video tweet over pure HTTP without browser', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
      const mainPayload = JSON.stringify({
        data: {
          tweet_result_by_rest_id: {
            rest_id: '2124087160907403401',
            result: {
              __typename: 'Tweet',
              rest_id: '2124087160907403401',
              core: { user_results: { result: { rest_id: 'u9', core: { name: '大师', screen_name: 'dashiAIxz' } } } },
              counts: { favorite_count: 1456, retweet_count: 209, reply_count: 54 },
              details: { created_at_ms: 1795256817000, full_text: 'https://t.co/abc' },
              article: {
                article_results: {
                  result: {
                    title: '纯 HTTP 零弹窗专栏测试',
                    content_state: {
                      blocks: [
                        { type: 'unstyled', text: '正文第一段', entity_ranges: [] },
                        { type: 'atomic', text: ' ', entity_ranges: [{ key: 0, length: 1, offset: 0 }] },
                      ],
                      entity_map: [
                        { key: '0', value: { type: 'TWEET', data: { tweet_id: '2122492466490433678' } } },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });
      const embPayload = JSON.stringify({
        data: {
          tweet_result_by_rest_id: {
            rest_id: '2122492466490433678',
            result: {
              __typename: 'Tweet',
              rest_id: '2122492466490433678',
              core: { user_results: { result: { rest_id: 'u9', core: { name: '大师', screen_name: 'dashiAIxz' } } } },
              counts: { favorite_count: 1193, retweet_count: 138, reply_count: 69 },
              details: { created_at_ms: 1794876612000, full_text: '内嵌视频推文' },
              media_entities2: [
                {
                  type: 'video',
                  media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/2122489058601660416/img/thumb.jpg',
                  video_info: {
                    variants: [
                      { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2122489058601660416/vid/hd.mp4' },
                    ],
                  },
                },
              ],
            },
          },
        },
      });
      const esc = (s: string) => JSON.stringify(s).slice(1, -1);
      const html = `<html><script>a={kind:"Result.Ok",value:"${esc(mainPayload)}"};b={kind:"Result.Ok",value:"${esc(embPayload)}"};</script></html>`;

      server = http.createServer((req, res) => {
        expect(req.headers.cookie).toContain('auth_token=test_tok');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('returns enriched main X Article + embedded tweet in a single HTTP request', async () => {
      const tweets = await fetchTweetThreadViaHttpSsr(
        `${baseUrl}/dashiAIxz/status/2124087160907403401`,
        '2124087160907403401',
        { cookieHeader: 'auth_token=test_tok; ct0=test_ct0', timeoutMs: 5000 }
      );
      expect(tweets.length).toBe(2);
      expect(tweets[0].tweet_id).toBe('2124087160907403401');
      expect(tweets[0].is_article).toBe(true);
      expect(tweets[0].text).toContain('# 纯 HTTP 零弹窗专栏测试');
      expect(tweets[0].text).toContain('🎬 [视频](https://video.twimg.com/amplify_video/2122489058601660416/vid/hd.mp4');
      expect(tweets[1].tweet_id).toBe('2122492466490433678');
    });
  });

  it('4. pure Retweet (RT @...) carrying an /i/article/ URL must be classified as retweet/short, NOT X Article', () => {
    // 复现真实推文 https://x.com/Jackywine/status/2125466327645356515
    const rawRt = {
      rest_id: '2125466327645356515',
      core: {
        user_results: {
          result: { rest_id: 'u10', core: { name: 'Jacky', screen_name: 'Jackywine' } },
        },
      },
      counts: { favorite_count: 0, retweet_count: 50, reply_count: 0 },
      details: {
        created_at_ms: 1795585636000,
        full_text: 'RT @AdrianPunk115: 小豆杀死了比赛，腾讯你拿什么比？ https://t.co/D8KlJsXss5',
      },
      legacy: {
        entities: { urls: [{ expanded_url: 'https://x.com/i/article/2125453411449733120' }] },
      },
      url_entities: [
        {
          url: 'https://t.co/D8KlJsXss5',
          expanded_url: 'https://x.com/i/article/2125453411449733120',
          display_url: 'x.com/i/article/2125…',
        },
      ],
    };

    const parsed = parseTweetResult(rawRt);
    expect(parsed).not.toBeNull();
    expect(parsed?.is_retweet).toBe(true);
    expect(parsed?.retweeted_author).toBe('AdrianPunk115');
    expect(parsed?.is_article).toBe(false);
    expect(isArticleTweet(parsed!)).toBe(false);
    expect(classifyTweetContentType(parsed!)).toBe('short');

    // 即使旧库中已有历史脏数据 is_article: true，isArticleTweet 也应识别其为转发壳不误判为专栏
    expect(
      isArticleTweet({
        ...parsed!,
        is_article: true,
      })
    ).toBe(false);
  });
});
