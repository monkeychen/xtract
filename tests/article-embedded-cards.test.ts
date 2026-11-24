import { describe, it, expect } from 'vitest';
import {
  extractSsrTweetPayloadsFromHtml,
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

  it('8. x-web SSR snake_case Article schema: cover_media_results, entity_map, entity_ranges, media_items, MARKDOWN, TWEET(tweet_id), ApiVideo(bit_rate)', () => {
    const coverImg = 'https://pbs.twimg.com/media/HXyIXspa4AA3tGs.jpg';
    const bodyImg = 'https://pbs.twimg.com/media/HXyIg41bcAAZBHD.jpg';
    const lowMp4 = 'https://video.twimg.com/amplify_video/2123709444882391040/vid/avc1/480x270/low.mp4?tag=29';
    const hdMp4 = 'https://video.twimg.com/amplify_video/2123709444882391040/vid/avc1/1920x1080/PAUEyPB9JNG-EccF.mp4?tag=29';
    const vidPoster = 'https://pbs.twimg.com/amplify_video_thumb/2123709444882391040/img/XN8HF0TbQeXfRjuf.jpg';

    const articleResult = {
      title: '全网独一份：最深度 AI 剪辑全流程教程',
      cover_media_results: {
        result: {
          media_id: '2124723064915288064',
          media_info: { __typename: 'ApiImage', original_img_url: coverImg },
        },
      },
      media_entities: [
        {
          media_id: '2124723222805704704',
          media_info: { __typename: 'ApiImage', original_img_url: bodyImg },
        },
        {
          media_id: '2123709444882391040',
          media_info: {
            __typename: 'ApiVideo',
            preview_image: { original_img_url: vidPoster },
            variants: [
              { bit_rate: 256000, content_type: 'video/mp4', url: lowMp4 },
              { bit_rate: 10368000, content_type: 'video/mp4', url: hdMp4 },
              { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/2123709444882391040/pl/a.m3u8' },
            ],
          },
        },
      ],
      content_state: {
        blocks: [
          { type: 'header-one', text: '一、流程说明', entity_ranges: [] },
          { type: 'atomic', text: ' ', entity_ranges: [{ key: 0, length: 1, offset: 0 }] },
          { type: 'atomic', text: ' ', entity_ranges: [{ key: 1, length: 1, offset: 0 }] },
          { type: 'atomic', text: ' ', entity_ranges: [{ key: 2, length: 1, offset: 0 }] },
          { type: 'atomic', text: ' ', entity_ranges: [{ key: 3, length: 1, offset: 0 }] },
          { type: 'atomic', text: ' ', entity_ranges: [{ key: 4, length: 1, offset: 0 }] },
        ],
        entity_map: [
          { key: '0', value: { type: 'MEDIA', data: { media_items: [{ media_id: '2124723222805704704' }] } } },
          { key: '1', value: { type: 'MEDIA', data: { media_items: [{ media_id: '2123709444882391040' }] } } },
          { key: '2', value: { type: 'MARKDOWN', data: { markdown: '```bash\nuvx mirobody mcp\n```' } } },
          { key: '3', value: { type: 'DIVIDER', data: {} } },
          { key: '4', value: { type: 'TWEET', data: { tweet_id: '2122492466490433678' } } },
        ],
      },
    };

    const embeddedMap = new Map<string, Partial<Tweet>>([
      [
        '2122492466490433678',
        {
          tweet_id: '2122492466490433678',
          author_name: '大师的AI小灶',
          author_username: 'dashiAIxz',
          text: '内嵌视频教程',
          video_url: 'https://video.twimg.com/amplify_video/2122489058601660416/vid/avc1/1920x1080/emb.mp4',
          media_urls: ['https://video.twimg.com/amplify_video/2122489058601660416/vid/avc1/1920x1080/emb.mp4'],
        },
      ],
    ]);

    const res = formatArticleContent(articleResult, embeddedMap);
    expect(res.text).toContain(`![封面图](${coverImg})`);
    expect(res.text).toContain(`![](${bodyImg})`);
    // Must pick highest bit_rate (10368000 -> hdMp4), NOT lowMp4
    expect(res.text).toContain(`🎬 [视频](${hdMp4} "poster=${vidPoster}")`);
    expect(res.text).not.toContain(lowMp4);
    expect(res.text).toContain('```bash\nuvx mirobody mcp\n```');
    expect(res.text).toContain('---');
    expect(res.text).toContain('大师的AI小灶');
    expect(res.text).toContain('https://x.com/dashiAIxz/status/2122492466490433678');
    expect(res.mediaUrls).toContain(coverImg);
    expect(res.mediaUrls).toContain(bodyImg);
    expect(res.mediaUrls).toContain(hdMp4);
    expect(res.mediaUrls).toContain('https://video.twimg.com/amplify_video/2122489058601660416/vid/avc1/1920x1080/emb.mp4');
  });

  it('9. parseTweetResult should support x-web SSR tweet fields (counts, details.created_at_ms, media_entities2, url_entities)', () => {
    const rawSsrTweet = {
      rest_id: '2122492466490433678',
      core: {
        user_results: {
          result: {
            rest_id: '10001',
            core: { name: '大师的AI小灶', screen_name: 'dashiAIxz' },
          },
        },
      },
      counts: {
        favorite_count: 1193,
        retweet_count: 138,
        reply_count: 69,
      },
      details: {
        created_at_ms: 1794876612000,
        full_text: '最深度AI剪辑教程 https://t.co/lDYHSySHvO',
      },
      views: { count: '200000' },
      legacy: { conversation_id_str: '2122492466490433678', lang: 'zh' },
      media_entities2: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/2122489058601660416/img/thumb.jpg',
          video_info: {
            variants: [
              { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2122489058601660416/vid/low.mp4' },
              { bitrate: 10368000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2122489058601660416/vid/hd.mp4' },
            ],
          },
        },
      ],
      url_entities: [
        {
          url: 'https://t.co/lDYHSySHvO',
          expanded_url: 'https://github.com/example/repo',
          display_url: 'github.com/example/repo',
        },
      ],
    };

    const parsed = parseTweetResult(rawSsrTweet);
    expect(parsed).not.toBeNull();
    expect(parsed?.tweet_id).toBe('2122492466490433678');
    expect(parsed?.like_count).toBe(1193);
    expect(parsed?.retweet_count).toBe(138);
    expect(parsed?.reply_count).toBe(69);
    expect(parsed?.created_at).toBe(new Date(1794876612000).toISOString());
    expect(parsed?.video_url).toBe('https://video.twimg.com/amplify_video/2122489058601660416/vid/hd.mp4');
    expect(parsed?.video_poster).toBe('https://pbs.twimg.com/amplify_video_thumb/2122489058601660416/img/thumb.jpg');
    expect(parsed?.text).toContain('[github.com/example/repo](https://github.com/example/repo)');
  });

  it('10. extractSsrTweetPayloadsFromHtml should decode $_TSR Result.Ok chunks (incl. \\x3C) and merge split tweet_result_by_rest_id records', () => {
    const metaPayload = JSON.stringify({
      data: {
        tweet_result_by_rest_id: {
          rest_id: '2124724609358631007',
          result: {
            __typename: 'Tweet',
            rest_id: '2124724609358631007',
            core: { user_results: { result: { rest_id: '1986', core: { name: '想风', screen_name: 'xaiwind' } } } },
            counts: { favorite_count: 82, retweet_count: 10, reply_count: 33 },
            details: { created_at_ms: 1795408797000, full_text: 'https://t.co/abc' },
            views: { count: '10495' },
            legacy: { conversation_id_str: '2124724609358631007' },
            article: {
              article_results: {
                result: { title: 'Mirobody 部署指南', preview_text: '预览' },
              },
            },
          },
        },
      },
    });

    const fullBodyPayload = JSON.stringify({
      data: {
        tweet_result_by_rest_id: {
          rest_id: '2124724609358631007',
          result: {
            __typename: 'Tweet',
            core: { user_results: { result: { rest_id: '1986', core: { name: '想风', screen_name: 'xaiwind' } } } },
            article: {
              article_results: {
                result: {
                  title: 'Mirobody 部署指南',
                  content_state: {
                    blocks: [
                      { type: 'unstyled', text: '正文内容 <secret>', entity_ranges: [] },
                    ],
                    entity_map: [],
                  },
                },
              },
            },
          },
        },
      },
    });

    // Simulate TanStack Router SSR JS string literal with \x3C escape for '<'
    const esc = (s: string) => JSON.stringify(s).slice(1, -1).replace(/</g, '\\x3C');
    const fakeHtml = `
      <script>$_TSR.router=($R=>$R[0]={result:{kind:"Result.Ok",value:"${esc(metaPayload)}"}});</script>
      <script>($R=>$R[1].next({result:{kind:"Result.Ok",value:"${esc(fullBodyPayload)}"}}));</script>
    `;

    const extracted = extractSsrTweetPayloadsFromHtml(fakeHtml);
    expect(extracted.size).toBe(1);
    const mergedRaw = extracted.get('2124724609358631007');
    expect(mergedRaw).toBeDefined();

    const parsed = parseTweetResult(mergedRaw);
    expect(parsed).not.toBeNull();
    expect(parsed?.tweet_id).toBe('2124724609358631007');
    expect(parsed?.author_username).toBe('xaiwind');
    expect(parsed?.like_count).toBe(82);
    expect(parsed?.view_count).toBe(10495);
    expect(parsed?.is_article).toBe(true);
    expect(parsed?.text).toContain('# Mirobody 部署指南');
    expect(parsed?.text).toContain('正文内容 <secret>');
  });
});
