import type { Tweet, TrendTopic, XListInfo } from '../types.js';

/**
 * Formats rich X Article content (Draft.js blocks & entities) into Markdown text with images.
 */
export function formatArticleContent(articleResult: any): { text: string; mediaUrls: string[] } {
  if (!articleResult) return { text: '', mediaUrls: [] };

  const lines: string[] = [];
  const mediaUrls: string[] = [];

  if (articleResult.title) {
    lines.push(`# ${articleResult.title}\n`);
  }

  if (articleResult.summary_text) {
    lines.push(`> **核心摘要 / 提要**:\n> ${articleResult.summary_text.replace(/\n/g, '\n> ')}\n`);
  }

  // Cover image
  if (articleResult.cover_media?.media_info?.original_img_url) {
    const coverUrl = articleResult.cover_media.media_info.original_img_url;
    if (!mediaUrls.includes(coverUrl)) mediaUrls.push(coverUrl);
    lines.push(`![封面图](${coverUrl})\n`);
  }

  // Media map for atomic blocks
  const mediaMap: Record<string, string> = {};
  if (Array.isArray(articleResult.media_entities)) {
    for (const m of articleResult.media_entities) {
      const url = m.media_info?.original_img_url;
      if (m.media_id && url) {
        mediaMap[m.media_id] = url;
        if (!mediaUrls.includes(url)) mediaUrls.push(url);
      }
    }
  }

  const entityMap: Record<string, string> = {};
  if (Array.isArray(articleResult.content_state?.entityMap)) {
    for (const item of articleResult.content_state.entityMap) {
      const mediaId = item.value?.data?.mediaItems?.[0]?.mediaId;
      if (mediaId && mediaMap[mediaId]) {
        entityMap[item.key] = mediaMap[mediaId];
      }
    }
  }

  if (Array.isArray(articleResult.content_state?.blocks)) {
    for (const b of articleResult.content_state.blocks) {
      const t = b.type;
      const text = b.text || '';
      if (t === 'header-one') {
        lines.push(`# ${text}\n`);
      } else if (t === 'header-two') {
        lines.push(`## ${text}\n`);
      } else if (t === 'header-three') {
        lines.push(`### ${text}\n`);
      } else if (t === 'blockquote') {
        lines.push(`> ${text}\n`);
      } else if (t === 'code-block') {
        lines.push(`\`\`\`\n${text}\n\`\`\`\n`);
      } else if (t === 'unordered-list-item') {
        lines.push(`- ${text}`);
      } else if (t === 'ordered-list-item') {
        lines.push(`1. ${text}`);
      } else if (t === 'atomic') {
        for (const er of b.entityRanges || []) {
          const imgUrl = entityMap[String(er.key)];
          if (imgUrl) {
            lines.push(`![](${imgUrl})\n`);
          }
        }
      } else {
        if (text.trim()) {
          lines.push(`${text}\n`);
        }
      }
    }
  }

  return {
    text: lines.join('\n').trim(),
    mediaUrls,
  };
}

/**
 * Extracts a clean Tweet object from an X GraphQL tweet_results node.
 */
export function parseTweetResult(tweetResult: any): Tweet | null {
  if (!tweetResult) return null;

  // Handle TweetWithVisibilityResults wrapper
  if (tweetResult.__typename === 'TweetWithVisibilityResults') {
    tweetResult = tweetResult.tweet || {};
  }

  const legacy = tweetResult.legacy;
  if (!legacy) return null;

  // Author info (supports user_results.result.core and legacy schema)
  const userResults = tweetResult.core?.user_results?.result || {};
  const userCore = userResults.core || {};
  const userLegacy = userResults.legacy || {};
  const authorId = userResults.rest_id || '';
  const authorName = userCore.name || userLegacy.name || '';
  const authorUsername = userCore.screen_name || userLegacy.screen_name || '';

  // Media & URLs
  const mediaUrls: string[] = [];

  // Check for X Articles or long-form note tweet
  let fullText = '';
  const articleResult = tweetResult.article?.article_results?.result;
  if (articleResult) {
    const art = formatArticleContent(articleResult);
    if (art.text) {
      fullText = art.text;
      for (const u of art.mediaUrls) {
        if (!mediaUrls.includes(u)) mediaUrls.push(u);
      }
    }
  }

  if (!fullText) {
    const noteTweet = tweetResult.note_tweet?.note_tweet_results?.result || {};
    fullText = noteTweet.text || legacy.full_text || '';
  }

  // Retweet info
  const isRetweet = Boolean(legacy.retweeted_status_result);
  let retweetedAuthor = '';
  let retweetedText = '';
  if (isRetweet) {
    let rtResult = legacy.retweeted_status_result?.result || {};
    if (rtResult.__typename === 'TweetWithVisibilityResults') {
      rtResult = rtResult.tweet || {};
    }
    const rtLegacy = rtResult.legacy || {};
    const rtUser = rtResult.core?.user_results?.result || {};
    retweetedAuthor = rtUser.core?.screen_name || rtUser.legacy?.screen_name || '';
    retweetedText = rtLegacy.full_text || '';
  }

  // Quote info
  const isQuote = Boolean(legacy.is_quote_status);
  let quotedAuthor = '';
  let quotedText = '';
  if (isQuote && tweetResult.quoted_status_result) {
    let qResult = tweetResult.quoted_status_result?.result || {};
    if (qResult.__typename === 'TweetWithVisibilityResults') {
      qResult = qResult.tweet || {};
    }
    const qLegacy = qResult.legacy || {};
    const qUser = qResult.core?.user_results?.result || {};
    quotedAuthor = qUser.core?.screen_name || qUser.legacy?.screen_name || '';
    quotedText = qLegacy.full_text || '';
  }
  const mediaItems = legacy.extended_entities?.media || legacy.entities?.media || [];
  for (const m of mediaItems) {
    if (m.media_url_https && !mediaUrls.includes(m.media_url_https)) {
      mediaUrls.push(m.media_url_https);
    }
    if (m.type === 'video' || m.type === 'animated_gif') {
      const variants = m.video_info?.variants || [];
      const mp4s = variants.filter((v: any) => v.content_type === 'video/mp4');
      if (mp4s.length > 0) {
        mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestUrl = mp4s[0].url;
        if (bestUrl && !mediaUrls.includes(bestUrl)) {
          mediaUrls.push(bestUrl);
        }
      }
    }
  }

  const urls: string[] = [];
  for (const u of legacy.entities?.urls || []) {
    if (u.expanded_url) {
      urls.push(u.expanded_url);
    }
  }

  return {
    tweet_id: String(tweetResult.rest_id || ''),
    author_id: String(authorId),
    author_name: authorName,
    author_username: authorUsername,
    text: fullText,
    created_at: normalizeTweetDate(legacy.created_at),
    is_retweet: isRetweet,
    retweeted_author: retweetedAuthor,
    retweeted_text: retweetedText,
    is_quote: isQuote,
    quoted_author: quotedAuthor,
    quoted_text: quotedText,
    like_count: Number(legacy.favorite_count || 0),
    retweet_count: Number(legacy.retweet_count || 0),
    reply_count: Number(legacy.reply_count || 0),
    view_count: Number(tweetResult.views?.count || 0),
    urls,
    media_urls: mediaUrls,
  };
}

/**
 * Extracts tweets from timeline instructions, filtering ads and cursors.
 */
export function parseTimelineInstructions(instructions: any[]): Tweet[] {
  const parsedTweets: Tweet[] = [];
  if (!Array.isArray(instructions)) return parsedTweets;

  for (const instruction of instructions) {
    const type = instruction?.type;
    let entries: any[] = [];
    if (type === 'TimelineAddEntries') {
      entries = instruction.entries || [];
    } else if (type === 'TimelineAddToModule') {
      entries = instruction.moduleItems || [];
    }

    for (const entry of entries) {
      const entryId = String(entry?.entryId || '').toLowerCase();
      // Skip promoted ads and cursors
      if (entryId.includes('promoted') || entryId.startsWith('cursor-')) {
        continue;
      }

      const content = entry?.content || {};
      const itemContent = content.itemContent || {};
      const tweetResults = itemContent.tweet_results?.result;
      if (tweetResults) {
        const t = parseTweetResult(tweetResults);
        if (t && t.tweet_id) {
          parsedTweets.push(t);
        }
      }

      // Handle items nested inside modules
      const items = content.items || [];
      for (const subItem of items) {
        const subIc = subItem?.item?.itemContent || {};
        const subTr = subIc.tweet_results?.result;
        if (subTr) {
          const subTweet = parseTweetResult(subTr);
          if (subTweet && subTweet.tweet_id) {
            parsedTweets.push(subTweet);
          }
        }
      }
    }
  }

  return parsedTweets;
}

/**
 * Recursively locates 'instructions' array in arbitrary X GraphQL response payloads.
 */
export function extractTimelineInstructions(data: any): any[] {
  if (!data || typeof data !== 'object') return [];

  const d = data.data || {};
  if (d.list?.tweets_timeline?.timeline?.instructions) {
    return d.list.tweets_timeline.timeline.instructions;
  }
  if (d.user?.result?.timeline?.timeline?.instructions) {
    return d.user.result.timeline.timeline.instructions;
  }
  if (d.user?.result?.timeline_v2?.timeline?.instructions) {
    return d.user.result.timeline_v2.timeline.instructions;
  }
  if (d.home?.home_timeline_urt?.instructions) {
    return d.home.home_timeline_urt.instructions;
  }
  if (d.search_by_raw_query?.search_timeline?.timeline?.instructions) {
    return d.search_by_raw_query.search_timeline.timeline.instructions;
  }

  // Recursive fallback search
  const stack: any[] = [data];
  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr && typeof curr === 'object') {
      if (Array.isArray(curr.instructions)) {
        return curr.instructions;
      }
      if (Array.isArray(curr)) {
        for (const item of curr) stack.push(item);
      } else {
        for (const val of Object.values(curr)) stack.push(val);
      }
    }
  }
  return [];
}

/**
 * Extracts organic trends from ExplorePage or GenericTimelineById GraphQL responses.
 */
export function parseTrendsFromGraphQL(payload: any): TrendTopic[] {
  const trends: TrendTopic[] = [];
  const seen = new Set<string>();

  function processItemContent(ic: any, isAi = false): void {
    if (!ic || typeof ic !== 'object') return;
    if (ic.__typename !== 'TimelineTrend' && !isAi) return;

    const name = ic.name;
    if (!name || seen.has(name)) return;

    // Filter out sponsored / promoted trends
    if (ic.promoted_metadata) return;
    const tm = ic.trend_metadata || {};
    const metaDesc = tm.meta_description || '';
    if (String(metaDesc).toLowerCase().includes('promoted')) return;

    const domain = tm.domain_context || '';
    let rank = trends.length + 1;
    if (ic.rank) {
      const parsedRank = parseInt(String(ic.rank), 10);
      if (!isNaN(parsedRank)) rank = parsedRank;
    }

    // Extract search query
    let query = name;
    const deepLink = tm.url?.url || '';
    if (deepLink.includes('query=')) {
      const match = deepLink.match(/query=([^&]+)/);
      if (match) {
        try {
          query = decodeURIComponent(match[1].replace(/\+/g, ' ')).replace(/^"|"$/g, '');
        } catch {
          // ignore decode errors
        }
      }
    }

    seen.add(name);
    trends.push({
      name,
      query,
      rank,
      domain,
      tweet_count: metaDesc && !metaDesc.toLowerCase().includes('promoted') ? metaDesc : '高热度讨论',
    });
  }

  function walk(d: any): void {
    if (!d || typeof d !== 'object') return;
    if (d.itemContent) {
      processItemContent(d.itemContent);
    }
    if (Array.isArray(d.items)) {
      for (const sub of d.items) {
        const subIc = sub?.item?.itemContent;
        if (subIc) processItemContent(subIc, true);
      }
    }
    for (const v of Object.values(d)) {
      walk(v);
    }
  }

  walk(payload);
  trends.sort((a, b) => a.rank - b.rank);
  return trends;
}

/**
 * Extracts X Lists from GraphQL responses (ListsManagementPageTimeline, Lists, etc.)
 */
export function extractListsFromGraphQL(payload: any): XListInfo[] {
  const lists: XListInfo[] = [];
  const seenIds = new Set<string>();

  function processListObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    const id = obj.id_str || obj.rest_id || (typeof obj.id === 'string' ? obj.id : '');
    const name = obj.name;
    if (id && name && !seenIds.has(id)) {
      seenIds.add(id);
      lists.push({
        id,
        name: typeof name === 'string' ? name : String(name),
        description: typeof obj.description === 'string' ? obj.description : undefined,
        member_count: typeof obj.member_count === 'number' ? obj.member_count : undefined,
        is_pinned: Boolean(obj.is_pinned),
      });
    }
  }

  function walk(d: any, parentKey?: string): void {
    if (!d || typeof d !== 'object') return;

    // 过滤推特官方推荐发现的第三方列表 (Discover / Suggested Lists)
    if (parentKey && /(?:suggested|discover|recommend|recommendation)/i.test(parentKey)) {
      return;
    }
    if (typeof d.entryId === 'string' && /(?:suggested|discover|recommend)/i.test(d.entryId)) {
      return;
    }

    if (d.__typename === 'TimelineList' || d.__typename === 'List') {
      processListObject(d);
    }
    if (d.list && typeof d.list === 'object') {
      processListObject(d.list);
    }
    if (d.timelineList && typeof d.timelineList === 'object') {
      processListObject(d.timelineList);
    }

    for (const [k, v] of Object.entries(d)) {
      walk(v, k);
    }
  }

  walk(payload);
  return lists;
}

/**
 * Normalizes any date string (especially X/Twitter legacy RFC2822 "Wed Aug 26 07:02:04 +0000 2026")
 * into a standard ISO-8601 string ("2026-08-26T07:02:04.000Z") so SQLite string sorting
 * (ORDER BY created_at DESC) strictly matches true chronological order.
 */
export function normalizeTweetDate(rawDate?: string): string {
  if (!rawDate) return new Date().toISOString();
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) {
    return rawDate;
  }
  return d.toISOString();
}

/**
 * Determines whether a tweet contains or represents an X Article (Twitter Article / Long-form).
 */
export function isArticleTweet(tweet: Partial<Tweet>): boolean {
  if (!tweet) return false;
  // 1. Check if urls contains an official article link
  const hasArticleUrl = Boolean(
    tweet.urls?.some((u) => /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(u))
  );
  // 2. Check if text explicitly contains an article link
  const hasArticleInText = Boolean(
    tweet.text && /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(tweet.text)
  );
  return hasArticleUrl || hasArticleInText;
}

/**
 * Checks whether a tweet's content is truncated or incomplete and requires on-demand full sync.
 * Covers:
 * 1. Note Tweets truncated with ellipsis and t.co link
 * 2. X Articles where timeline only provided title/cover image instead of full multi-thousand-word body
 */
export function isTweetContentIncomplete(tweet: Partial<Tweet>): boolean {
  if (!tweet || !tweet.text) return true;

  // 1. Truncated Note Tweet check (ends with … https://t.co/... or ... https://t.co/...)
  const isTruncatedNote = Boolean(
    /…\s*https:\/\/t\.co\/\S+$/.test(tweet.text) ||
      /\.\.\.\s*https:\/\/t\.co\/\S+$/.test(tweet.text) ||
      (tweet.text.length < 120 && tweet.text.includes('https://t.co/'))
  );
  if (isTruncatedNote) return true;

  // 2. X Article incomplete check:
  // If it's an Article, but the body only contains the title and cover image without actual long-form blocks
  if (isArticleTweet(tweet)) {
    const textWithoutMedia = tweet.text.replace(/!\[.*?\]\(.*?\)/g, '').trim();
    // In timeline view, Article preview text without cover image is typically under 300 characters
    if (textWithoutMedia.length < 400) {
      return true;
    }
  }

  return false;
}
