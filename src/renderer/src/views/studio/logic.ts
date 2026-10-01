import type { Tweet, TweetQueryOptions } from '../../types.js';
import type { StreamEvent } from '../../../../preload/index.js';

/**
 * 工作台核心业务逻辑（纯函数层）
 *
 * 全部契约见 openspec/changes/2026-09-30-test-regression-net/design.md，
 * 单元测试见 tests/studio-logic.test.ts 与 tests/studio-crawl.test.ts。
 * 本文件不得引入任何 React 依赖或浏览器 API。
 */

export type DataSource = 'following' | 'search' | 'user' | 'lists';

export interface BuildQueryParams {
  streamFilter: string;
  searchQuery: string;
  userHandle: string;
  /** 可能是 'custom' 哨兵值 */
  selectedList: string;
  customListId: string;
  /** 显式覆盖，undefined 表示不覆盖 */
  queryParam?: string;
  userParam?: string;
  listIdParam?: string;
}

/**
 * 依据当前数据源构造本地查询过滤条件。
 * 注意：search 源的 sourceType 为 'all'（检索本地全库），并非 'search'。
 */
export function buildQueryOptions(
  source: DataSource,
  params: BuildQueryParams
): { sourceType: TweetQueryOptions['sourceType']; query?: string; user?: string; listId?: string } {
  let sourceType: TweetQueryOptions['sourceType'];
  let q: string | undefined = undefined;
  let u: string | undefined = undefined;
  let lId: string | undefined = undefined;

  if (source === 'user') {
    sourceType = 'user';
    u = (params.userParam !== undefined ? params.userParam : params.userHandle).trim().replace(/^@/, '') || undefined;
  } else if (source === 'search') {
    // 全网搜索工作台：检索本地推文库，为空时不添加任何关键词过滤（查全库），有词时全库模糊搜索
    sourceType = 'all';
    q = (params.queryParam !== undefined ? params.queryParam : params.searchQuery).trim() || undefined;
  } else if (source === 'lists') {
    sourceType = 'list';
    lId = (
      params.listIdParam !== undefined
        ? params.listIdParam
        : params.selectedList === 'custom'
        ? params.customListId
        : params.selectedList
    ).trim() || undefined;
  } else {
    sourceType = 'following';
    q = (params.queryParam !== undefined ? params.queryParam : params.streamFilter).trim() || undefined;
  }

  return { sourceType, query: q, user: u, listId: lId };
}

export function isVideoUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('video.twimg.com');
}

export function isTweetVideo(tweet: Partial<Tweet>): boolean {
  if (tweet.video_url) return true;
  return Boolean(tweet.media_urls && tweet.media_urls.some((m) => isVideoUrl(m)));
}

// ============================================================================
// 推文分类与媒体提取
// ============================================================================

/** X 专栏文章链接特征（urls 或正文中） */
const ARTICLE_URL_PATTERN = /(?:x\.com|twitter\.com)\/i\/article\/\d+/i;
/** 官方长推截断体特征：正文以省略号 + t.co 结尾 */
const TRUNCATED_BODY_PATTERN = /…\s*https:\/\/t\.co\/\S+$/i;

export interface TweetClassification {
  /** 是否为 X 专栏文章 (Article) */
  isArticle: boolean;
  /** 是否为长推文 (Note Tweet) */
  isLong: boolean;
}

/**
 * 判定推文的专栏/长推文属性。
 * 两个布尔值独立计算，UI 上的互斥优先级由调用方负责。
 */
export function classifyTweet(tweet: Partial<Tweet>): TweetClassification {
  const isArticle = Boolean(
    tweet.is_article ||
    tweet.urls?.some((u) => ARTICLE_URL_PATTERN.test(u)) ||
    (tweet.text && ARTICLE_URL_PATTERN.test(tweet.text)) ||
    tweet.text?.startsWith('# ')
  );
  const isLong = Boolean(
    tweet.is_note_tweet ||
    (tweet.text && tweet.text.length > 280) ||
    (tweet.text && TRUNCATED_BODY_PATTERN.test(tweet.text.trim()))
  );
  return { isArticle, isLong };
}

export interface TweetMedia {
  isVideo: boolean;
  videoUrl?: string;
  /** 非视频推文恒为 undefined，严禁把首张真实配图排挤掉 */
  posterUrl?: string;
  /** 已剔除视频 URL；视频推文额外剔除封面 */
  displayImages: string[];
}

/** 提取推文的展示媒体：视频直链、视频封面与图集。 */
export function extractMedia(tweet: Partial<Tweet>): TweetMedia {
  const isVideo = isTweetVideo(tweet);
  const videoUrl = tweet.video_url || tweet.media_urls?.find((m) => isVideoUrl(m));
  // 只有视频推文才提取 video_poster；非视频推文 posterUrl 必须为 undefined，严禁把首张配图排挤掉
  const posterUrl = isVideo
    ? tweet.video_poster ||
      tweet.media_urls?.find((m) => m.includes('ext_tw_video_thumb') || m.includes('video_thumb')) ||
      tweet.media_urls?.find((m) => !isVideoUrl(m)) ||
      undefined
    : undefined;
  // 非视频推文展示全部真实配图；视频推文若有 posterUrl 则在视频播放器展示封面
  const displayImages = (tweet.media_urls || []).filter(
    (m) => !isVideoUrl(m) && (isVideo && posterUrl ? m !== posterUrl : true)
  );
  return { isVideo, videoUrl, posterUrl, displayImages };
}

/** 对本地已加载推文做关键词内存过滤：匹配正文、作者昵称、作者用户名，大小写不敏感。 */
export function filterTweetsByKeyword(tweets: Tweet[], keyword: string): Tweet[] {
  if (!keyword.trim()) return tweets;
  const q = keyword.toLowerCase().trim();
  return tweets.filter(
    (t) =>
      (t.text && t.text.toLowerCase().includes(q)) ||
      (t.author_name && t.author_name.toLowerCase().includes(q)) ||
      (t.author_username && t.author_username.toLowerCase().includes(q))
  );
}

// ============================================================================
// 抓取进度归约与日期格式化
// ============================================================================

export interface CrawlProgress {
  active: boolean;
  source: DataSource;
  title: string;
  stage: string;
  detail: string;
  percent: number;
  completed?: boolean;
  error?: string;
}

/**
 * 归约主进程推送的抓取流式事件（普通进度 / 完成 / 失败三态）。
 * fallbackSource 显式传入，避免归约逻辑对闭包 dataSource 产生隐式依赖。
 */
export function reduceStreamEvent(
  prev: CrawlProgress | null,
  event: StreamEvent,
  fallbackSource: DataSource
): CrawlProgress | null {
  if (!event) return prev;
  if (event.stage === 'error') {
    return prev
      ? {
          ...prev,
          stage: '抓取失败',
          detail: event.text || '发生未知错误',
          percent: 100,
          error: event.text,
        }
      : null;
  }
  if (event.stage === 'done') {
    return prev
      ? {
          ...prev,
          stage: '抓取完成',
          detail: event.text || '已完成落库去重',
          percent: 100,
          completed: true,
        }
      : null;
  }
  return {
    active: true,
    source: prev?.source || fallbackSource,
    title: prev?.title || '正在抓取推文数据',
    stage: event.text || '正在处理...',
    detail: `进度: ${event.progress || 50}%`,
    percent: event.progress || 50,
  };
}

/** 格式化推文绝对时间；日期不可解析时回退返回原始字符串。 */
export function formatTweetDate(iso: string): string {
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

// ============================================================================
// 抓取前置守卫与入参计算
// ============================================================================

/** 抓取条数换算为分页数（每页 20 条，至少一页）。 */
export function computePages(limit: number): number {
  return Math.max(1, Math.ceil(limit / 20));
}

/** 从搜索词或 URL 中提取推文 ID；无匹配返回 undefined。 */
export function extractTweetIdFromQuery(query: string): string | undefined {
  const m = query.match(/status\/(\d{5,})/) || query.match(/^(\d{5,})$/);
  return m ? m[1] : undefined;
}

/** 从列表 ID 或列表 URL 中解析出纯数字列表 ID。 */
export function resolveListId(raw: string): string {
  const m = raw.match(/(\d{5,})/);
  return m ? m[1] : raw;
}

/**
 * 抓取目标合法性校验。
 * 仅对 search / user 两个需要用户输入的源做校验；
 * following 恒有效，lists 的 ID 校验由 handleCrawl 内的空值分支单独处理。
 */
export function validateCrawlTarget(
  source: DataSource,
  target: string
): { ok: true } | { ok: false; message: string } {
  if (source === 'search') {
    if (!target.trim()) return { ok: false, message: '请输入要搜索的关键词' };
  } else if (source === 'user') {
    if (!target.trim().replace(/^@/, '')) {
      return { ok: false, message: '请输入要追踪的博主用户名（如 @username）' };
    }
  }
  return { ok: true };
}

// ============================================================================
// 列表选择状态
// ============================================================================

/**
 * 判断当前可见的推文是否已被全部勾选。
 *
 * 必须按「每一项是否都在勾选集合中」判断，不能比较两个集合的大小：
 * 当关键词过滤让可见项变少时，勾选集合中仍可能残留被过滤掉的 id，
 * 大小相等会因此误判为「未全选」。
 */
export function isAllSelected(visibleIds: string[], checkedIds: Set<string>): boolean {
  if (visibleIds.length === 0) return false;
  return visibleIds.every((id) => checkedIds.has(id));
}
