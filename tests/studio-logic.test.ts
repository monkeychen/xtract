import { describe, it, expect } from 'vitest';
import type { Tweet } from '../src/main/types.js';
import {
  classifyTweet,
  extractMedia,
  filterTweetsByKeyword,
} from '../src/renderer/src/views/studio/logic.js';

const base = {
  tweet_id: '1',
  author_name: 'A',
  author_username: 'a',
  text: 't',
  created_at: '2026-01-01T00:00:00.000Z',
  like_count: 0,
  retweet_count: 0,
} satisfies Partial<Tweet>;

const asTweet = (p: Partial<Tweet>): Tweet => ({ ...base, ...p }) as Tweet;

// ============================================================================
// classifyTweet — 消除列表视图 (1780-1818) 与详情视图 (1912-1947) 的重复判定
// 契约见 openspec/2026-09-30-test-regression-net/design.md §2.1
// ============================================================================

describe('classifyTweet (专栏/长推文判定 §2.1)', () => {
  it('should detect article via is_article flag', () => {
    expect(classifyTweet({ ...base, is_article: true })).toEqual({ isArticle: true, isLong: false });
  });

  it('should detect article via an /i/article/ URL in urls', () => {
    expect(classifyTweet({ ...base, urls: ['https://x.com/i/article/1234567'] })).toEqual({
      isArticle: true,
      isLong: false,
    });
  });

  it('should detect article via an /i/article/ URL embedded in the text body', () => {
    expect(classifyTweet({ ...base, text: '详见 https://twitter.com/i/article/999 阅读全文' })).toEqual({
      isArticle: true,
      isLong: false,
    });
  });

  it('should treat a leading "# " markdown heading as an article', () => {
    expect(classifyTweet({ ...base, text: '# 标题\n正文' })).toEqual({ isArticle: true, isLong: false });
  });

  it('should NOT treat a "#" without a trailing space as an article', () => {
    // "#标题" 不满足 startsWith('# ')，且正文很短，两项都应为 false
    expect(classifyTweet({ ...base, text: '#标题' })).toEqual({ isArticle: false, isLong: false });
  });

  it('should detect long-form via is_note_tweet flag', () => {
    expect(classifyTweet({ ...base, is_note_tweet: true })).toEqual({ isArticle: false, isLong: true });
  });

  it('should detect long-form when the body exceeds 280 characters', () => {
    expect(classifyTweet({ ...base, text: '甲'.repeat(281) })).toEqual({ isArticle: false, isLong: true });
  });

  it('should treat exactly 280 characters as NOT long-form (boundary)', () => {
    expect(classifyTweet({ ...base, text: '甲'.repeat(280) })).toEqual({ isArticle: false, isLong: false });
  });

  it('should detect long-form from the truncated-body + t.co signature', () => {
    expect(classifyTweet({ ...base, text: '正文被截断了…\nhttps://t.co/abc123' })).toEqual({
      isArticle: false,
      isLong: true,
    });
  });

  it('should compute both flags independently for a long article', () => {
    // 专栏 + 超过 280 字：两个布尔值必须同时为 true，互斥关系由调用方负责
    const r = classifyTweet({ ...base, is_article: true, text: '甲'.repeat(281) });
    expect(r).toEqual({ isArticle: true, isLong: true });
  });

  it('should return both false for a bare object', () => {
    expect(classifyTweet({})).toEqual({ isArticle: false, isLong: false });
  });

  it('should return both false for a short plain-text tweet', () => {
    expect(classifyTweet({ ...base, text: '今天天气不错' })).toEqual({ isArticle: false, isLong: false });
  });
});

// ============================================================================
// extractMedia — 抽离 2162-2176 的内联 IIFE
// 契约见 design.md §2.2；posterUrl 的非视频硬约束来自源码 2164 行注释
// ============================================================================

describe('extractMedia (媒体提取 §2.2)', () => {
  it('should take videoUrl from an explicit video_url field', () => {
    const r = extractMedia({ ...base, video_url: 'https://video.twimg.com/a.mp4' });
    expect(r.isVideo).toBe(true);
    expect(r.videoUrl).toBe('https://video.twimg.com/a.mp4');
  });

  it('should locate a video inside media_urls when video_url is absent', () => {
    const r = extractMedia({
      ...base,
      media_urls: ['https://pbs.twimg.com/a.jpg', 'https://video.twimg.com/b.mp4'],
    });
    expect(r.isVideo).toBe(true);
    expect(r.videoUrl).toBe('https://video.twimg.com/b.mp4');
  });

  it('should use video_poster as the first-tier poster fallback', () => {
    const r = extractMedia({
      ...base,
      video_url: 'https://video.twimg.com/a.mp4',
      video_poster: 'https://pbs.twimg.com/poster.jpg',
      media_urls: ['https://pbs.twimg.com/thumb.jpg'],
    });
    expect(r.posterUrl).toBe('https://pbs.twimg.com/poster.jpg');
  });

  it('should fall back to an ext_tw_video_thumb media entry for the poster', () => {
    const r = extractMedia({
      ...base,
      video_url: 'https://video.twimg.com/a.mp4',
      media_urls: ['https://pbs.twimg.com/other.jpg', 'https://pbs.twimg.com/ext_tw_video_thumb/1.jpg'],
    });
    expect(r.posterUrl).toBe('https://pbs.twimg.com/ext_tw_video_thumb/1.jpg');
  });

  it('should fall back to the first non-video media entry for the poster', () => {
    const r = extractMedia({
      ...base,
      video_url: 'https://video.twimg.com/a.mp4',
      media_urls: ['https://video.twimg.com/a.mp4', 'https://pbs.twimg.com/only.jpg'],
    });
    expect(r.posterUrl).toBe('https://pbs.twimg.com/only.jpg');
  });

  it('should yield an undefined poster for a video tweet with no images at all', () => {
    const r = extractMedia({ ...base, video_url: 'https://video.twimg.com/a.mp4' });
    expect(r.posterUrl).toBeUndefined();
  });

  it('MUST yield an undefined poster for NON-video tweets (hard constraint)', () => {
    // 源码 2164 行明确约束：非视频推文 posterUrl 必须为 undefined，
    // 严禁把首张真实配图排挤掉
    const r = extractMedia({ ...base, media_urls: ['https://pbs.twimg.com/first.jpg'] });
    expect(r.isVideo).toBe(false);
    expect(r.posterUrl).toBeUndefined();
  });

  it('MUST keep the first image in displayImages for non-video tweets', () => {
    const r = extractMedia({ ...base, media_urls: ['https://pbs.twimg.com/first.jpg', 'https://pbs.twimg.com/second.jpg'] });
    expect(r.displayImages).toEqual(['https://pbs.twimg.com/first.jpg', 'https://pbs.twimg.com/second.jpg']);
  });

  it('should strip the poster out of displayImages for video tweets', () => {
    const r = extractMedia({
      ...base,
      video_url: 'https://video.twimg.com/a.mp4',
      video_poster: 'https://pbs.twimg.com/poster.jpg',
      media_urls: ['https://pbs.twimg.com/poster.jpg', 'https://pbs.twimg.com/extra.jpg'],
    });
    expect(r.displayImages).toEqual(['https://pbs.twimg.com/extra.jpg']);
  });

  it('should always filter video URLs out of displayImages', () => {
    const r = extractMedia({
      ...base,
      video_url: 'https://video.twimg.com/a.mp4',
      video_poster: 'https://pbs.twimg.com/poster.jpg',
      media_urls: ['https://video.twimg.com/a.mp4', 'https://video.twimg.com/b.m3u8', 'https://pbs.twimg.com/x.jpg'],
    });
    expect(r.displayImages).toEqual(['https://pbs.twimg.com/x.jpg']);
  });

  it('should promote the only non-video image of a video tweet to the poster, leaving no grid', () => {
    // poster 第三级 fallback 会把视频推文唯一的配图提升为封面，
    // 该图随即从图集剔除（封面在播放器中展示，不重复出现）
    const r = extractMedia({
      ...base,
      video_url: 'https://video.twimg.com/a.mp4',
      media_urls: ['https://video.twimg.com/a.mp4', 'https://pbs.twimg.com/only.jpg'],
    });
    expect(r.posterUrl).toBe('https://pbs.twimg.com/only.jpg');
    expect(r.displayImages).toEqual([]);
  });

  it('should return an empty displayImages list when media_urls is missing or empty', () => {
    expect(extractMedia({ ...base }).displayImages).toEqual([]);
    expect(extractMedia({ ...base, media_urls: [] }).displayImages).toEqual([]);
  });
});

// ============================================================================
// filterTweetsByKeyword — 抽离 1223-1231 的内存过滤
// 契约见 design.md §2.3
// ============================================================================

describe('filterTweetsByKeyword (内存全文过滤 §2.3)', () => {
  const tweets = [
    asTweet({ tweet_id: '1', text: '深度解析 LLM 架构', author_name: 'Karpathy', author_username: 'karpathy' }),
    asTweet({ tweet_id: '2', text: 'Something about Rust', author_name: 'BurntSushi', author_username: 'BurntSushi' }),
    asTweet({ tweet_id: '3', text: '无关键词内容', author_name: '某作者', author_username: 'nobody' }),
  ];

  it('should short-circuit and return the same array reference for an empty keyword', () => {
    expect(filterTweetsByKeyword(tweets, '')).toBe(tweets);
  });

  it('should short-circuit and return the same array reference for a whitespace-only keyword', () => {
    expect(filterTweetsByKeyword(tweets, '   ')).toBe(tweets);
  });

  it('should match against the tweet body', () => {
    expect(filterTweetsByKeyword(tweets, '架构').map((t) => t.tweet_id)).toEqual(['1']);
  });

  it('should match against author_name', () => {
    expect(filterTweetsByKeyword(tweets, 'BurntSushi').map((t) => t.tweet_id)).toEqual(['2']);
  });

  it('should match against author_username', () => {
    expect(filterTweetsByKeyword(tweets, 'karpathy').map((t) => t.tweet_id)).toEqual(['1']);
  });

  it('should be case-insensitive across all three fields', () => {
    expect(filterTweetsByKeyword(tweets, 'KARPATHY').map((t) => t.tweet_id)).toEqual(['1']);
    expect(filterTweetsByKeyword(tweets, 'burntsushi').map((t) => t.tweet_id)).toEqual(['2']);
    expect(filterTweetsByKeyword(tweets, 'rUSt').map((t) => t.tweet_id)).toEqual(['2']);
  });

  it('should return an empty array when nothing matches', () => {
    expect(filterTweetsByKeyword(tweets, '不存在的关键词zzz')).toEqual([]);
  });

  it('should not throw on tweets with all three fields undefined', () => {
    const sparse = [{ tweet_id: '9' } as unknown as Tweet];
    expect(() => filterTweetsByKeyword(sparse, 'x')).not.toThrow();
    expect(filterTweetsByKeyword(sparse, 'x')).toEqual([]);
  });
});

import {
  buildQueryOptions,
  reduceStreamEvent,
  formatTweetDate,
  type CrawlProgress,
} from '../src/renderer/src/views/studio/logic.js';

// ============================================================================
// buildQueryOptions — 抽离 729-746 的四分支数据源→查询映射
// 契约见 design.md §2.4
// ============================================================================

const params = {
  streamFilter: '',
  searchQuery: '',
  userHandle: '',
  selectedList: '',
  customListId: '',
};

describe('buildQueryOptions (数据源→查询参数映射 §2.4)', () => {
  it('MUST map the search source to sourceType "all", not "search"', () => {
    // 全网搜索工作台检索的是本地全库，sourceType 必须是 'all'。
    // 这是重构中最易被"顺手改成更一致"而改坏的高危语义。
    const r = buildQueryOptions('search', { ...params, searchQuery: 'AI' });
    expect(r.sourceType).toBe('all');
    expect(r.user).toBeUndefined();
    expect(r.listId).toBeUndefined();
  });

  it('should map the following source to sourceType "following" with the stream filter as query', () => {
    const r = buildQueryOptions('following', { ...params, streamFilter: '  transformer  ' });
    expect(r).toEqual({ sourceType: 'following', query: 'transformer' });
  });

  it('should map the user source to sourceType "user" and strip the @ prefix', () => {
    const r = buildQueryOptions('user', { ...params, userHandle: '@karpathy' });
    expect(r).toEqual({ sourceType: 'user', user: 'karpathy' });
  });

  it('should map the lists source to sourceType "list" using the selected list id', () => {
    const r = buildQueryOptions('lists', { ...params, selectedList: '2100985900734062922' });
    expect(r).toEqual({ sourceType: 'list', listId: '2100985900734062922' });
  });

  it('should resolve the "custom" sentinel to customListId for the lists source', () => {
    const r = buildQueryOptions('lists', {
      ...params,
      selectedList: 'custom',
      customListId: ' 1234567890 ',
    });
    expect(r.listId).toBe('1234567890');
  });

  it('should normalise blank inputs to undefined for every branch', () => {
    expect(buildQueryOptions('following', { ...params, streamFilter: '   ' }).query).toBeUndefined();
    expect(buildQueryOptions('search', { ...params, searchQuery: '' }).query).toBeUndefined();
    expect(buildQueryOptions('user', { ...params, userHandle: '@' }).user).toBeUndefined();
    expect(buildQueryOptions('lists', { ...params, selectedList: '' }).listId).toBeUndefined();
  });

  it('should let queryParam override the component state for the following source', () => {
    const r = buildQueryOptions('following', {
      ...params,
      streamFilter: 'stateValue',
      queryParam: '  overrideValue  ',
    });
    expect(r.query).toBe('overrideValue');
  });

  it('should let userParam override the component state for the user source', () => {
    const r = buildQueryOptions('user', {
      ...params,
      userHandle: 'stateUser',
      userParam: '@overrideUser',
    });
    expect(r.user).toBe('overrideUser');
  });

  it('should let listIdParam override the selected list for the lists source', () => {
    const r = buildQueryOptions('lists', {
      ...params,
      selectedList: '1111111111',
      listIdParam: ' 2222222222 ',
    });
    expect(r.listId).toBe('2222222222');
  });

  it('should treat an empty-string override as an explicit value, not as "no override"', () => {
    // queryParam !== undefined 即视为显式传入；空串归一化为 undefined
    const r = buildQueryOptions('following', { ...params, streamFilter: 'state', queryParam: '' });
    expect(r.query).toBeUndefined();
  });
});

// ============================================================================
// reduceStreamEvent — 抽离 653-691 的流式进度归约
// 契约见 design.md §2.5
// ============================================================================

const activeProgress: CrawlProgress = {
  active: true,
  source: 'following',
  title: '正在从 X 官方流实时抓取关注流',
  stage: '正在启动真实浏览器嗅探网络流...',
  detail: '安全节流规避风控',
  percent: 25,
};

const streamEvent = (over: Partial<{ stage: string; text?: string; progress?: number }>) =>
  ({ taskId: 't1', stage: 'fetch', ...over }) as any;

describe('reduceStreamEvent (流式进度归约 §2.5)', () => {
  it('should return null for an error event when there is no prior progress', () => {
    expect(reduceStreamEvent(null, streamEvent({ stage: 'error', text: 'boom' }), 'search')).toBeNull();
  });

  it('should return null for a done event when there is no prior progress', () => {
    expect(reduceStreamEvent(null, streamEvent({ stage: 'done' }), 'search')).toBeNull();
  });

  it('should mark the progress as failed on an error event', () => {
    const r = reduceStreamEvent(activeProgress, streamEvent({ stage: 'error', text: '风控拦截' }), 'search');
    expect(r).toMatchObject({
      stage: '抓取失败',
      detail: '风控拦截',
      percent: 100,
      error: '风控拦截',
    });
  });

  it('should fall back to a generic message when the error event carries no text', () => {
    const r = reduceStreamEvent(activeProgress, streamEvent({ stage: 'error' }), 'search');
    expect(r).toMatchObject({ stage: '抓取失败', detail: '发生未知错误' });
  });

  it('should mark the progress as completed on a done event', () => {
    const r = reduceStreamEvent(activeProgress, streamEvent({ stage: 'done' }), 'search');
    expect(r).toMatchObject({
      stage: '抓取完成',
      detail: '已完成落库去重',
      percent: 100,
      completed: true,
    });
  });

  it('should fall back to a generic completion message when the done event carries no text', () => {
    const r = reduceStreamEvent(activeProgress, streamEvent({ stage: 'done', text: '' }), 'search');
    expect(r!.detail).toBe('已完成落库去重');
  });

  it('should create a fresh progress card for a normal streaming event', () => {
    const r = reduceStreamEvent(null, streamEvent({ text: '正在搜索', progress: 42 }), 'search');
    expect(r).toEqual({
      active: true,
      source: 'search',
      title: '正在抓取推文数据',
      stage: '正在搜索',
      detail: '进度: 42%',
      percent: 42,
    });
  });

  it('should prefer the prior source over the fallback source', () => {
    const r = reduceStreamEvent(activeProgress, streamEvent({ text: 'x' }), 'search');
    expect(r!.source).toBe('following');
  });

  it('should prefer the prior title over the default title', () => {
    const r = reduceStreamEvent(activeProgress, streamEvent({ text: 'x' }), 'search');
    expect(r!.title).toBe('正在从 X 官方流实时抓取关注流');
  });

  it('should default progress to 50 and the stage text when absent', () => {
    const r = reduceStreamEvent(null, streamEvent({}), 'user');
    expect(r).toMatchObject({
      source: 'user',
      stage: '正在处理...',
      detail: '进度: 50%',
      percent: 50,
    });
  });
});

// ============================================================================
// formatTweetDate — 抽离 1955-1962 的日期 IIFE
// 契约见 design.md §2.6
// ============================================================================

describe('formatTweetDate (绝对时间格式化 §2.6)', () => {
  it('should format a valid ISO string using the zh-CN locale without AM/PM', () => {
    const iso = '2026-03-12T08:05:00.000Z';
    const expected = new Date(iso).toLocaleString('zh-CN', { hour12: false });
    expect(formatTweetDate(iso)).toBe(expected);
  });

  it('should return the raw string for an empty input', () => {
    expect(formatTweetDate('')).toBe('');
  });

  it('should return the raw string for an unparseable date', () => {
    expect(formatTweetDate('not-a-date')).toBe('not-a-date');
  });

  it('should return the raw string for an out-of-range calendar date', () => {
    expect(formatTweetDate('2026-13-45T99:99:99Z')).toBe('2026-13-45T99:99:99Z');
  });
});
