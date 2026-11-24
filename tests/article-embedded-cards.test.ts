import { describe, it, expect } from 'vitest';
import {
  formatArticleContent,
  parseTweetResult,
  parseTweetResultsByRestIds,
} from '../src/main/client/parser.js';
import type { Tweet } from '../src/main/types.js';

describe('X Article Embedded Tweet Cards & Divider Parsing', () => {
  it('1. should parse DIVIDER entity as markdown horizontal rule ---', () => {
    const articleResult = {
      title: '测试专栏',
      content_state: {
        blocks: [
          { type: 'header-one', text: '第一节' },
          {
            type: 'atomic',
            text: ' ',
            entityRanges: [{ key: 0, length: 1, offset: 0 }],
          },
          { type: 'unstyled', text: '正文内容' },
        ],
        entityMap: [
          {
            key: '0',
            value: {
              type: 'DIVIDER',
              data: {},
            },
          },
        ],
      },
    };

    const res = formatArticleContent(articleResult);
    expect(res.text).toContain('# 第一节');
    expect(res.text).toContain('---');
    expect(res.text).toContain('正文内容');
  });

  it('2. should parse TWEET entity with graceful fallback link card when no tweet details provided', () => {
    const articleResult = {
      title: 'AI 导航',
      content_state: {
        blocks: [
          { type: 'header-two', text: 'AI 基础与科普' },
          {
            type: 'atomic',
            text: ' ',
            entityRanges: [{ key: 0, length: 1, offset: 0 }],
          },
        ],
        entityMap: [
          {
            key: '0',
            value: {
              type: 'TWEET',
              data: {
                tweetId: '2107048203673817266',
                url: 'https://x.com/HytidelLegend/status/2107048203673817266',
              },
            },
          },
        ],
      },
    };

    const res = formatArticleContent(articleResult);
    expect(res.text).toContain('## AI 基础与科普');
    // Must NOT be empty, must contain the tweet link and quote block
    expect(res.text).toContain('2107048203673817266');
    expect(res.text).toContain('https://x.com/HytidelLegend/status/2107048203673817266');
    expect(res.text).toMatch(/>\s*(?:🔗|💬)/);
  });

  it('3. should enrich TWEET entity into full card markdown when embedded tweet details are supplied', () => {
    const articleResult = {
      title: 'AI 导航',
      content_state: {
        blocks: [
          { type: 'header-two', text: 'AI 基础与科普' },
          {
            type: 'atomic',
            text: ' ',
            entityRanges: [{ key: 0, length: 1, offset: 0 }],
          },
        ],
        entityMap: [
          {
            key: '0',
            value: {
              type: 'TWEET',
              data: {
                tweetId: '2107048203673817266',
                url: 'https://x.com/HytidelLegend/status/2107048203673817266',
              },
            },
          },
        ],
      },
    };

    const embeddedTweet: Partial<Tweet> = {
      tweet_id: '2107048203673817266',
      author_name: 'Hytidel聊商业',
      author_username: 'HytidelLegend',
      text: '「AI 基础与科普」必看的 20 篇文章：\n\n《普通人学 AI》 https://t.co/abc',
      created_at: '2026-10-05T10:00:13.000Z',
    };

    const tweetsMap = new Map<string, Partial<Tweet>>([
      ['2107048203673817266', embeddedTweet],
    ]);

    const res = formatArticleContent(articleResult, tweetsMap);
    expect(res.text).toContain('## AI 基础与科普');
    expect(res.text).toContain('Hytidel聊商业');
    expect(res.text).toContain('@HytidelLegend');
    expect(res.text).toContain('「AI 基础与科普」必看的 20 篇文章');
    expect(res.text).toContain('https://x.com/HytidelLegend/status/2107048203673817266');
  });

  it('4. should parse GraphQL TweetResultsByRestIds payload with multiple tweet items', () => {
    const rawGql = {
      data: {
        tweetResult: [
          {
            result: {
              rest_id: '2107048203673817266',
              core: {
                user_results: {
                  result: {
                    core: { name: 'Author A', screen_name: 'author_a' },
                  },
                },
              },
              legacy: {
                full_text: 'Tweet content 1',
                created_at: 'Mon Oct 05 10:00:13 +0000 2026',
                favorite_count: 10,
                retweet_count: 5,
              },
            },
          },
          {
            result: {
              rest_id: '2107053579433640002',
              core: {
                user_results: {
                  result: {
                    core: { name: 'Author B', screen_name: 'author_b' },
                  },
                },
              },
              legacy: {
                full_text: 'Tweet content 2',
                created_at: 'Mon Oct 05 11:00:00 +0000 2026',
                favorite_count: 20,
                retweet_count: 8,
              },
            },
          },
        ],
      },
    };

    const parsed = parseTweetResultsByRestIds(rawGql);
    expect(parsed.length).toBe(2);
    expect(parsed[0].tweet_id).toBe('2107048203673817266');
    expect(parsed[0].author_username).toBe('author_a');
    expect(parsed[0].text).toBe('Tweet content 1');
    expect(parsed[1].tweet_id).toBe('2107053579433640002');
    expect(parsed[1].author_username).toBe('author_b');
    expect(parsed[1].text).toBe('Tweet content 2');
  });

  it('5. parseTweetResult should enrich article text with embedded tweets map', () => {
    const rawArticleTweet = {
      rest_id: '999888777',
      core: {
        user_results: {
          result: {
            core: { name: 'Editor', screen_name: 'editor_x' },
          },
        },
      },
      legacy: {
        full_text: 'Article Preview',
        created_at: 'Tue Oct 06 12:00:00 +0000 2026',
      },
      article: {
        article_results: {
          result: {
            title: 'Weekly Roundup',
            content_state: {
              blocks: [
                { type: 'header-one', text: 'Top Picks' },
                {
                  type: 'atomic',
                  text: ' ',
                  entityRanges: [{ key: 0, length: 1, offset: 0 }],
                },
              ],
              entityMap: [
                {
                  key: '0',
                  value: {
                    type: 'TWEET',
                    data: {
                      tweetId: '111222333',
                      url: 'https://x.com/creator/status/111222333',
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };

    const embeddedMap = new Map<string, Partial<Tweet>>([
      [
        '111222333',
        {
          tweet_id: '111222333',
          author_name: 'Creator One',
          author_username: 'creator_one',
          text: 'Check out my new AI framework!',
        },
      ],
    ]);

    const tweet = parseTweetResult(rawArticleTweet, embeddedMap);
    expect(tweet).not.toBeNull();
    expect(tweet?.is_article).toBe(true);
    expect(tweet?.text).toContain('# Weekly Roundup');
    expect(tweet?.text).toContain('# Top Picks');
    expect(tweet?.text).toContain('Creator One');
    expect(tweet?.text).toContain('@creator_one');
    expect(tweet?.text).toContain('Check out my new AI framework!');
    expect(tweet?.text).toContain('https://x.com/creator/status/111222333');
  });

  it('6. UT-1a: formatArticleContent should render embedded TWEET video markers and collect video URLs into mediaUrls', () => {
    const articleResult = {
      title: 'Fable 5.2 视频合集',
      content_state: {
        blocks: [
          { type: 'header-two', text: '案例一' },
          { type: 'atomic', text: ' ', entityRanges: [{ key: 0, length: 1, offset: 0 }] },
        ],
        entityMap: [
          {
            key: '0',
            value: {
              type: 'TWEET',
              data: {
                tweetId: '2121343522318274958',
                url: 'https://x.com/ChrisGPT/status/2121343522318274958',
              },
            },
          },
        ],
      },
    };

    const videoUrl1 = 'https://video.twimg.com/amplify_video/2121343472368074752/vid/avc1/3840x2160/rdmP3hbqzNGNuPrj.mp4?tag=29';
    const posterUrl1 = 'https://pbs.twimg.com/amplify_video_thumb/2121343472368074752/img/jhtGcT4FbrEL1Df0.jpg';
    const videoUrl2 = 'https://video.twimg.com/amplify_video/2121343472368074999/vid/avc1/1920x1080/second.mp4?tag=29';
    const posterUrl2 = 'https://pbs.twimg.com/amplify_video_thumb/2121343472368074999/img/second.jpg';

    const embeddedMap = new Map<string, Partial<Tweet>>([
      [
        '2121343522318274958',
        {
          tweet_id: '2121343522318274958',
          author_name: 'Chris',
          author_username: 'ChrisGPT',
          text: 'Fable 5.2 animated a cowboy toy',
          video_url: videoUrl1,
          video_poster: posterUrl1,
          media_urls: [posterUrl1, videoUrl1, posterUrl2, videoUrl2],
        },
      ],
    ]);

    const res = formatArticleContent(articleResult, embeddedMap);
    expect(res.text).toContain(`> 🎬 [视频](${videoUrl1} "poster=${posterUrl1}")`);
    expect(res.text).toContain(`> 🎬 [视频](${videoUrl2} "poster=${posterUrl2}")`);
    expect(res.mediaUrls).toContain(videoUrl1);
    expect(res.mediaUrls).toContain(posterUrl1);
    expect(res.mediaUrls).toContain(videoUrl2);
    expect(res.mediaUrls).toContain(posterUrl2);
  });

  it('7. UT-1b: formatArticleContent should defensively parse native video media_entities in X Article', () => {
    const nativeMp4 = 'https://video.twimg.com/ext_tw_video/888000111/vid/avc1/1280x720/demo.mp4';
    const nativePoster = 'https://pbs.twimg.com/ext_tw_video_thumb/888000111/img/poster.jpg';

    const articleResult = {
      title: '原生视频专栏',
      media_entities: [
        {
          media_id: '888000111',
          media_info: {
            __typename: 'ApiVideo',
            preview_image: { original_img_url: nativePoster },
            variants: [
              { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/ext_tw_video/888000111/vid/low.mp4' },
              { content_type: 'video/mp4', bitrate: 2176000, url: nativeMp4 },
            ],
          },
        },
      ],
      content_state: {
        blocks: [
          { type: 'atomic', text: ' ', entityRanges: [{ key: 0, length: 1, offset: 0 }] },
        ],
        entityMap: [
          {
            key: '0',
            value: {
              type: 'MEDIA',
              data: { mediaItems: [{ mediaId: '888000111' }] },
            },
          },
        ],
      },
    };

    const res = formatArticleContent(articleResult);
    expect(res.text).toContain(`🎬 [视频](${nativeMp4} "poster=${nativePoster}")`);
    expect(res.mediaUrls).toContain(nativeMp4);
    expect(res.mediaUrls).toContain(nativePoster);
  });
});
