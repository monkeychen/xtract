import { describe, it, expect } from 'vitest';
import type { Tweet } from '../src/main/types.js';
import {
  getTweetListDisplayTitle,
  extractTweetTitleAndSnippet,
  formatRelativeTime,
  formatCount,
} from '../src/renderer/src/views/studio/formatters.js';
import { isVideoUrl, isTweetVideo } from '../src/renderer/src/views/studio/logic.js';

describe('StudioView List Display Title (getTweetListDisplayTitle §1)', () => {
  it('should extract explicit markdown title if first line starts with #', () => {
    const raw = '# Claude 3.7 Sonnet 深度评测\n在多项编码和长思维链基准测试中，Claude 3.7 展现出强大的推理潜力。';
    expect(getTweetListDisplayTitle(raw)).toBe('Claude 3.7 Sonnet 深度评测');
  });

  it('should extract bracketed topic from first line as title', () => {
    const raw = '【重磅发布】Anthropic 推出全新混合推理架构\n今天凌晨正式上线，支持实时调节思考预算。';
    expect(getTweetListDisplayTitle(raw)).toBe('【重磅发布】 Anthropic 推出全新混合推理架构');
  });

  it('should extract first line text if no markdown title or brackets', () => {
    const raw = '深度解析 LLM 的多轮对话上下文管理。\n第一点是滑动窗口；\n第二点是向量检索；\n第三点是思维链压缩。';
    expect(getTweetListDisplayTitle(raw)).toBe('深度解析 LLM 的多轮对话上下文管理。');
  });

  it('should handle single-line short text', () => {
    expect(getTweetListDisplayTitle('只能说MiniMax-3是真的拉...')).toBe('只能说MiniMax-3是真的拉...');
    expect(getTweetListDisplayTitle('收藏')).toBe('收藏');
  });

  it('should extract first sentence by punctuation for long single line', () => {
    const raw = '春节一人独闯老家，去他妈的传统观念，哪那么多执念，如果执念让我们都不舒服。';
    expect(getTweetListDisplayTitle(raw)).toBe('春节一人独闯老家，去他妈的传统观念，哪那么多执念，如果执念让我们都不舒服。');
  });

  it('should handle links and empty text gracefully', () => {
    expect(getTweetListDisplayTitle('https://t.co/GQWBDf6QnW')).toBe('🔗 https://t.co/GQWBDf6QnW');
    expect(getTweetListDisplayTitle('')).toBe('（无文本推文）');
  });
});

describe('StudioView List Formatter (extractTweetTitleAndSnippet)', () => {
  it('should extract explicit markdown title if first line starts with #', () => {
    const raw = '# Claude 3.7 Sonnet 深度评测\n在多项编码和长思维链基准测试中，Claude 3.7 展现出强大的推理潜力。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('Claude 3.7 Sonnet 深度评测');
    expect(res.snippet).toBe('在多项编码和长思维链基准测试中，Claude 3.7 展现出强大的推理潜力。');
  });

  it('should extract bracketed topic from first line as title', () => {
    const raw = '【重磅发布】Anthropic 推出全新混合推理架构\n今天凌晨正式上线，支持实时调节思考预算。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('【重磅发布】 Anthropic 推出全新混合推理架构');
    expect(res.snippet).toBe('今天凌晨正式上线，支持实时调节思考预算。');
  });

  it('should use first line as title and remaining lines as snippet for multi-line tweet', () => {
    const raw = '深度解析 LLM 的多轮对话上下文管理。\n第一点是滑动窗口；\n第二点是向量检索；\n第三点是思维链压缩。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('深度解析 LLM 的多轮对话上下文管理。');
    expect(res.snippet).toContain('第一点是滑动窗口');
  });

  it('should treat short single-line tweet as pure title without snippet', () => {
    const raw = '只能说MiniMax-3是真的拉...';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('只能说MiniMax-3是真的拉...');
    expect(res.snippet).toBeUndefined();
  });

  it('should treat single-line "收藏" as pure title', () => {
    const raw = '收藏';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('收藏');
    expect(res.snippet).toBeUndefined();
  });

  it('should split long single-line tweet by punctuation into title and snippet', () => {
    const raw = '春节一人独闯老家，去他妈的传统观念，哪那么多执念，如果执念让我们都不舒服，那就不能在思绪里出现，瞬间都不行。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('春节一人独闯老家');
    expect(res.snippet).toContain('去他妈的传统观念');
  });

  it('should handle pure link tweets gracefully', () => {
    const raw = 'https://t.co/GQWBDf6QnW';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('🔗 https://t.co/GQWBDf6QnW');
    expect(res.snippet).toBeUndefined();
  });

  it('should handle empty or whitespace text gracefully', () => {
    expect(extractTweetTitleAndSnippet('').title).toBe('（无文本推文）');
    expect(extractTweetTitleAndSnippet('   ').title).toBe('（无文本推文）');
  });
});

describe('StudioView formatRelativeTime & formatCount', () => {
  it('should format relative times correctly', () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(formatRelativeTime(tenMinAgo)).toBe('10分钟前');

    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2小时前');
  });

  it('should format numbers with K / M suffix', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(450)).toBe('450');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(2500000)).toBe('2.5M');
  });
});

// ============================================================================
// Task 1: 补齐既有导出函数的测试缺口 (openspec 2026-09-30-test-regression-net)
// ============================================================================

describe('isVideoUrl (视频 URL 判定 §1.1)', () => {
  it('should return false for empty / undefined input', () => {
    expect(isVideoUrl(undefined)).toBe(false);
    expect(isVideoUrl('')).toBe(false);
  });

  it('should detect .mp4 URLs', () => {
    expect(isVideoUrl('https://video.twimg.com/ext_tw_video/123/pu/vid/720x720/abc.mp4?tag=12')).toBe(true);
    expect(isVideoUrl('https://example.com/assets/clip.mp4')).toBe(true);
  });

  it('should detect .m3u8 (HLS stream) URLs case-insensitively', () => {
    expect(isVideoUrl('https://video.twimg.com/x.m3u8')).toBe(true);
    expect(isVideoUrl('https://example.com/stream.M3U8')).toBe(true);
  });

  it('should detect video.twimg.com hosts even without a file extension', () => {
    expect(isVideoUrl('https://video.twimg.com/amplify_video/999')).toBe(true);
  });

  it('should return false for image and non-video URLs', () => {
    expect(isVideoUrl('https://pbs.twimg.com/media/AbCdEf.jpg')).toBe(false);
    expect(isVideoUrl('https://example.com/article')).toBe(false);
  });
});

describe('isTweetVideo (推文是否含视频 §1.2)', () => {
  const base = {
    tweet_id: '1',
    author_name: 'A',
    author_username: 'a',
    text: 't',
    created_at: '2026-01-01T00:00:00.000Z',
    like_count: 0,
    retweet_count: 0,
  } satisfies Partial<Tweet>;

  it('should be true when video_url is present', () => {
    expect(isTweetVideo({ ...base, video_url: 'https://video.twimg.com/a.mp4' })).toBe(true);
  });

  it('should be true when a video is only present inside media_urls', () => {
    expect(isTweetVideo({ ...base, media_urls: ['https://pbs.twimg.com/a.jpg', 'https://video.twimg.com/a.mp4'] })).toBe(true);
  });

  it('should be false for image-only tweets', () => {
    expect(isTweetVideo({ ...base, media_urls: ['https://pbs.twimg.com/a.jpg'] })).toBe(false);
  });

  it('should be false for empty media arrays and bare objects', () => {
    expect(isTweetVideo({ ...base, media_urls: [] })).toBe(false);
    expect(isTweetVideo({ ...base, media_urls: undefined, video_url: undefined })).toBe(false);
  });
});

describe('formatRelativeTime 全分支覆盖 (§1.3)', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('should render 刚刚 for anything under 60 seconds', () => {
    expect(formatRelativeTime(ago(0))).toBe('刚刚');
    expect(formatRelativeTime(ago(59 * 1000))).toBe('刚刚');
  });

  it('should render N分钟前 for 1 minute to 1 hour', () => {
    expect(formatRelativeTime(ago(60 * 1000))).toBe('1分钟前');
    expect(formatRelativeTime(ago(59 * 60 * 1000))).toBe('59分钟前');
  });

  it('should render N小时前 for 1 hour to 24 hours', () => {
    expect(formatRelativeTime(ago(3600 * 1000))).toBe('1小时前');
    expect(formatRelativeTime(ago(23 * 3600 * 1000))).toBe('23小时前');
  });

  it('should render 昨天 between 24 and 48 hours', () => {
    expect(formatRelativeTime(ago(24 * 3600 * 1000))).toBe('昨天');
    expect(formatRelativeTime(ago(47 * 3600 * 1000))).toBe('昨天');
  });

  it('should render N天前 between 2 and 7 days', () => {
    expect(formatRelativeTime(ago(2 * 86400 * 1000))).toBe('2天前');
    expect(formatRelativeTime(ago(6 * 86400 * 1000))).toBe('6天前');
  });

  it('should fall back to M-D beyond 7 days', () => {
    const sevenDaysAgo = new Date(Date.now() - 8 * 86400 * 1000);
    expect(formatRelativeTime(sevenDaysAgo.toISOString())).toBe(
      `${sevenDaysAgo.getMonth() + 1}-${sevenDaysAgo.getDate()}`
    );
  });

  it('should return empty string for undefined input', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('should slice invalid dates to their first 10 characters', () => {
    expect(formatRelativeTime('not-a-real-date-string')).toBe('not-a-real');
    expect(formatRelativeTime('2026-13-45T99:99:99Z')).toBe('2026-13-45');
  });
});

describe('formatCount 边界覆盖 (§1.4)', () => {
  it('should return 0 for falsy inputs', () => {
    expect(formatCount(undefined)).toBe('0');
    expect(formatCount(0)).toBe('0');
  });

  it('should keep values below 1000 untouched', () => {
    expect(formatCount(1)).toBe('1');
    expect(formatCount(999)).toBe('999');
  });

  it('should switch to K at the 1000 boundary', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(1500)).toBe('1.5K');
  });

  it('should roll 999999 up to 1000.0K (no M promotion until 1e6)', () => {
    expect(formatCount(999999)).toBe('1000.0K');
  });

  it('should switch to M at the 1000000 boundary', () => {
    expect(formatCount(1000000)).toBe('1.0M');
    expect(formatCount(12345678)).toBe('12.3M');
  });
});

describe('extractTweetTitleAndSnippet 未覆盖路径 (§1.5)', () => {
  it('should split long single-line text at the first comma when no sentence-ending punctuation exists', () => {
    // 51 chars, no 。！？?!;； but a comma within the 4-30 char window
    const head = '甲'.repeat(10);
    const tail = '乙'.repeat(40);
    const res = extractTweetTitleAndSnippet(head + ',' + tail);
    expect(res.title).toBe(head);
    expect(res.snippet).toBe(tail);
  });

  it('should truncate to 40 chars plus ellipsis when no punctuation exists at all', () => {
    const single = '甲'.repeat(50);
    const res = extractTweetTitleAndSnippet(single);
    expect(res.title).toBe('甲'.repeat(40) + '...');
    expect(res.snippet).toBe('甲'.repeat(10));
  });

  it('should truncate the snippet to 120 characters for multi-line tweets', () => {
    const res = extractTweetTitleAndSnippet('标题\n' + '丙'.repeat(200));
    expect(res.title).toBe('标题');
    expect(res.snippet).toBe('丙'.repeat(120));
  });

  it('should produce an undefined snippet when punctuation ends the sentence with nothing after it', () => {
    const res = extractTweetTitleAndSnippet('甲'.repeat(10) + '。' + '乙'.repeat(45));
    expect(res.title).toBe('甲'.repeat(10) + '。');
    expect(res.snippet).toBe('乙'.repeat(45));
  });
});
