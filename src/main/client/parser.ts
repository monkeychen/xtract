import type { Tweet, TrendTopic } from '../types.js';

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

  // Check for long-form note tweet (X Articles / Long Tweets)
  const noteTweet = tweetResult.note_tweet?.note_tweet_results?.result || {};
  const fullText = noteTweet.text || legacy.full_text || '';

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

  // Media & URLs
  const mediaUrls: string[] = [];
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
    created_at: legacy.created_at || '',
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
