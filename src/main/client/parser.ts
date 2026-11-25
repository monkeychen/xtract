import {
  ALL_TWEET_CONTENT_TYPES,
  DEFAULT_TWEET_CONTENT_TYPES,
  type Tweet,
  type TweetContentType,
  type TweetVideoItem,
  type TrendTopic,
  type XListInfo,
} from '../types.js';

/**
 * Formats rich X Article content (Draft.js blocks & entities) into Markdown text with images.
 */
export interface ParsedArticleEntity {
  type: string;
  imageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  tweetId?: string;
  tweetUrl?: string;
  markdown?: string;
}

function isVideoMediaUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('video.twimg.com');
}

function extractTwitterMediaId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:amplify_video|ext_tw_video|tweet_video)(?:_thumb)?\/(\d+)/);
  return match ? match[1] : null;
}

export function extractTweetVideos(tweet: Partial<Tweet>): TweetVideoItem[] {
  const videoUrls: string[] = [];
  if (tweet.video_url && isVideoMediaUrl(tweet.video_url)) {
    videoUrls.push(tweet.video_url);
  }
  for (const m of tweet.media_urls || []) {
    if (isVideoMediaUrl(m) && !videoUrls.includes(m)) {
      videoUrls.push(m);
    }
  }
  if (videoUrls.length === 0) return [];

  const nonVideoImages = (tweet.media_urls || []).filter((m) => !isVideoMediaUrl(m));
  const usedPosters = new Set<string>();

  return videoUrls.map((vUrl, idx) => {
    const mediaId = extractTwitterMediaId(vUrl);
    let posterUrl: string | undefined;

    if (mediaId) {
      posterUrl = nonVideoImages.find((img) => !usedPosters.has(img) && extractTwitterMediaId(img) === mediaId);
    }
    if (!posterUrl && idx === 0 && tweet.video_poster && !usedPosters.has(tweet.video_poster)) {
      posterUrl = tweet.video_poster;
    }
    if (!posterUrl && idx === 0) {
      posterUrl = nonVideoImages.find(
        (img) => !usedPosters.has(img) && (img.includes('video_thumb') || img.includes('ext_tw_video_thumb'))
      );
    }
    if (posterUrl) usedPosters.add(posterUrl);
    return { url: vUrl, posterUrl };
  });
}

export function formatVideoMarkdownLine(videoUrl: string, posterUrl?: string): string {
  if (posterUrl) {
    return `🎬 [视频](${videoUrl} "poster=${posterUrl}")`;
  }
  return `🎬 [视频](${videoUrl})`;
}

/**
 * Formats rich X Article content (Draft.js blocks & entities) into Markdown text with images, videos, and embedded tweet cards.
 */
export function formatArticleContent(
  articleResult: any,
  embeddedTweets?: Map<string, Partial<Tweet>> | Record<string, Partial<Tweet>>
): { text: string; mediaUrls: string[] } {
  if (!articleResult) return { text: '', mediaUrls: [] };

  const lines: string[] = [];
  const mediaUrls: string[] = [];

  if (articleResult.title) {
    lines.push(`# ${articleResult.title}\n`);
  }

  if (articleResult.summary_text) {
    lines.push(`> **核心摘要 / 提要**:\n> ${articleResult.summary_text.replace(/\n/g, '\n> ')}\n`);
  }

  // Cover image (supports both legacy cover_media and x-web cover_media_results)
  const coverUrl =
    articleResult.cover_media?.media_info?.original_img_url ||
    articleResult.cover_media_results?.result?.media_info?.original_img_url;
  if (coverUrl) {
    if (!mediaUrls.includes(coverUrl)) mediaUrls.push(coverUrl);
    lines.push(`![封面图](${coverUrl})\n`);
  }

  // Media map for atomic image & native video blocks (supports media_entities & media_entities_results)
  const mediaMap: Record<
    string,
    { type: 'IMAGE' | 'VIDEO'; imageUrl?: string; videoUrl?: string; posterUrl?: string }
  > = {};
  const rawMediaEntities = Array.isArray(articleResult.media_entities)
    ? articleResult.media_entities
    : Array.isArray(articleResult.media_entities_results)
      ? articleResult.media_entities_results
      : [];
  for (const rawItem of rawMediaEntities) {
    const m = rawItem?.result || rawItem;
    if (!m) continue;
    const mediaId = m.media_id ? String(m.media_id) : '';
    const info = m.media_info || {};
    const variants = info.variants || info.video_info?.variants || [];
    const mp4s = Array.isArray(variants)
      ? variants.filter((v: any) => v?.content_type === 'video/mp4' && v?.url)
      : [];
    if (mediaId && mp4s.length > 0) {
      mp4s.sort(
        (a: any, b: any) =>
          Number(b.bit_rate ?? b.bitrate ?? 0) - Number(a.bit_rate ?? a.bitrate ?? 0)
      );
      const bestVideoUrl = mp4s[0].url;
      const posterUrl = info.preview_image?.original_img_url || info.original_img_url || undefined;
      mediaMap[mediaId] = { type: 'VIDEO', videoUrl: bestVideoUrl, posterUrl };
      if (posterUrl && !mediaUrls.includes(posterUrl)) mediaUrls.push(posterUrl);
      if (!mediaUrls.includes(bestVideoUrl)) mediaUrls.push(bestVideoUrl);
      continue;
    }

    const url = info.original_img_url;
    if (mediaId && url) {
      mediaMap[mediaId] = { type: 'IMAGE', imageUrl: url };
      if (!mediaUrls.includes(url)) mediaUrls.push(url);
    }
  }

  // Parse all Draft.js entities: IMAGE, VIDEO, DIVIDER, MARKDOWN, TWEET, etc.
  // Supports both camelCase (entityMap / mediaItems / mediaId / tweetId) and x-web SSR snake_case (entity_map / media_items / media_id / tweet_id)
  const entityMap: Record<string, ParsedArticleEntity> = {};
  const rawEntityMap =
    articleResult.content_state?.entityMap ?? articleResult.content_state?.entity_map;
  const entityEntries: Array<{ key: string; value: any }> = Array.isArray(rawEntityMap)
    ? rawEntityMap.map((item: any) => ({ key: String(item.key), value: item.value }))
    : rawEntityMap && typeof rawEntityMap === 'object'
      ? Object.entries(rawEntityMap).map(([key, value]) => ({ key: String(key), value }))
      : [];

  for (const item of entityEntries) {
    const entType = item.value?.type;
    const data = item.value?.data || {};

    if (entType === 'DIVIDER') {
      entityMap[item.key] = { type: 'DIVIDER' };
    } else if (entType === 'MARKDOWN' && typeof data.markdown === 'string' && data.markdown.trim()) {
      entityMap[item.key] = { type: 'MARKDOWN', markdown: data.markdown };
    } else if (entType === 'TWEET') {
      const rawTweetId = data.tweetId ?? data.tweet_id;
      const tweetId = rawTweetId ? String(rawTweetId) : '';
      const tweetUrl = data.url || (tweetId ? `https://x.com/i/status/${tweetId}` : '');
      entityMap[item.key] = { type: 'TWEET', tweetId, tweetUrl };
    } else {
      const mediaItems = data.mediaItems || data.media_items;
      const rawMediaId = mediaItems?.[0]?.mediaId ?? mediaItems?.[0]?.media_id;
      const mediaId = rawMediaId ? String(rawMediaId) : '';
      const mapped = mediaId ? mediaMap[mediaId] : undefined;
      if (mapped?.type === 'VIDEO' && mapped.videoUrl) {
        entityMap[item.key] = {
          type: 'VIDEO',
          videoUrl: mapped.videoUrl,
          posterUrl: mapped.posterUrl,
        };
      } else if (mapped?.type === 'IMAGE' && mapped.imageUrl) {
        entityMap[item.key] = { type: 'IMAGE', imageUrl: mapped.imageUrl };
      } else if (entType) {
        entityMap[item.key] = { type: entType };
      }
    }
  }

  // Helper to resolve embedded tweet details
  const getEmbeddedTweet = (tweetId: string): Partial<Tweet> | undefined => {
    if (!tweetId || !embeddedTweets) return undefined;
    if (embeddedTweets instanceof Map) {
      return embeddedTweets.get(tweetId);
    }
    return (embeddedTweets as Record<string, Partial<Tweet>>)[tweetId];
  };

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
        for (const er of b.entityRanges || b.entity_ranges || []) {
          const ent = entityMap[String(er.key)];
          if (!ent) continue;

          if (ent.type === 'DIVIDER') {
            lines.push('\n---\n');
          } else if (ent.type === 'MARKDOWN' && ent.markdown) {
            lines.push(`${ent.markdown.trimEnd()}\n`);
          } else if (ent.type === 'VIDEO' && ent.videoUrl) {
            lines.push(`${formatVideoMarkdownLine(ent.videoUrl, ent.posterUrl)}\n`);
          } else if (ent.imageUrl) {
            lines.push(`![](${ent.imageUrl})\n`);
          } else if (ent.type === 'TWEET') {
            const tweetId = ent.tweetId || '';
            const tweetInfo = tweetId ? getEmbeddedTweet(tweetId) : undefined;
            const resolvedTweetUrl =
              ent.tweetUrl && !ent.tweetUrl.includes('/i/status/')
                ? ent.tweetUrl
                : tweetInfo?.author_username && tweetId
                  ? `https://x.com/${tweetInfo.author_username}/status/${tweetId}`
                  : ent.tweetUrl || (tweetId ? `https://x.com/i/status/${tweetId}` : '');

            if (tweetInfo) {
              const headerParts: string[] = [];
              if (tweetInfo.author_name) headerParts.push(`**${tweetInfo.author_name}**`);
              if (tweetInfo.author_username) headerParts.push(`(@${tweetInfo.author_username})`);
              const header = headerParts.join(' ');

              const cardLines: string[] = [];
              cardLines.push(`> 💬 ${header || '推文'}`);
              cardLines.push('>');
              if (tweetInfo.text) {
                const bodyLines = tweetInfo.text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').split('\n');
                for (const bl of bodyLines) {
                  cardLines.push(`> ${bl}`);
                }
              }
              const embeddedVideos = extractTweetVideos(tweetInfo);
              if (embeddedVideos.length > 0) {
                cardLines.push('>');
                for (const v of embeddedVideos) {
                  cardLines.push(`> ${formatVideoMarkdownLine(v.url, v.posterUrl)}`);
                  if (v.posterUrl && !mediaUrls.includes(v.posterUrl)) {
                    mediaUrls.push(v.posterUrl);
                  }
                  if (!mediaUrls.includes(v.url)) {
                    mediaUrls.push(v.url);
                  }
                }
              }
              if (resolvedTweetUrl) {
                cardLines.push('>');
                cardLines.push(`> 🔗 [原文链接](${resolvedTweetUrl})`);
              }
              lines.push(cardLines.join('\n') + '\n');
            } else if (resolvedTweetUrl) {
              lines.push(`> 🔗 **引用推文**: [${resolvedTweetUrl}](${resolvedTweetUrl})\n`);
            }
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
 * Extracts and parses tweets from GraphQL TweetResultsByRestIds response.
 */
export function parseTweetResultsByRestIds(data: any): Tweet[] {
  if (!data) return [];
  const tweetResultList = data.data?.tweetResult || data.tweetResult;
  if (!Array.isArray(tweetResultList)) return [];

  const parsedTweets: Tweet[] = [];
  for (const item of tweetResultList) {
    const rawResult = item?.result;
    if (rawResult) {
      const tweet = parseTweetResult(rawResult);
      if (tweet && tweet.tweet_id) {
        parsedTweets.push(tweet);
      }
    }
  }
  return parsedTweets;
}

/**
 * URL entity structure from Twitter GraphQL.
 */
export interface UrlEntity {
  url?: string;
  expanded_url?: string;
  display_url?: string;
}

/**
 * 将推文文本中的 t.co 短链转换为 Markdown 超链接 [display_url](expanded_url)，
 * 并安全剔除正文末尾仅作为配图/视频附件展示的无意义媒体短链。
 */
export function formatTweetTextWithMarkdownUrls(
  text: string,
  urlEntities: UrlEntity[] = [],
  mediaEntities: Array<{ url?: string }> = []
): string {
  if (!text) return '';
  let res = text;

  // 0. 规范化换行符：清洗转义字符字面量 "\n" / "\r\n" 为物理真实换行符，并统一格式
  res = res.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  // 1. 移除多媒体附件短链 (推特官方在正文末尾自动追加的配图/视频短链，如 " https://t.co/SqrFuDR2et")
  for (const m of mediaEntities) {
    if (m?.url) {
      res = res.replaceAll(` ${m.url}`, '');
      res = res.replaceAll(m.url, '');
    }
  }
  res = res.trimEnd();

  // 2. 将外链 t.co 替换为 Markdown 格式 [display_url](expanded_url)
  for (const u of urlEntities) {
    if (u?.url && u?.expanded_url) {
      const label = u.display_url || u.expanded_url;
      res = res.replaceAll(u.url, `[${label}](${u.expanded_url})`);
    }
  }

  return res;
}

/**
 * Extracts a clean Tweet object from an X GraphQL tweet_results node.
 */
export function parseTweetResult(
  tweetResult: any,
  embeddedTweets?: Map<string, Partial<Tweet>> | Record<string, Partial<Tweet>>
): Tweet | null {
  if (!tweetResult) return null;

  // Handle TweetWithVisibilityResults wrapper
  if (tweetResult.__typename === 'TweetWithVisibilityResults') {
    tweetResult = tweetResult.tweet || {};
  }

  const legacy = tweetResult.legacy || {};
  const details = tweetResult.details || {};
  const counts = tweetResult.counts || {};
  const hasCorePayload = Boolean(
    tweetResult.legacy ||
      tweetResult.details ||
      tweetResult.article?.article_results?.result ||
      tweetResult.note_tweet?.note_tweet_results?.result
  );
  if (!hasCorePayload) return null;

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
    const art = formatArticleContent(articleResult, embeddedTweets);
    if (art.text) {
      fullText = art.text;
      for (const u of art.mediaUrls) {
        if (!mediaUrls.includes(u)) mediaUrls.push(u);
      }
    }
  }

  if (!fullText) {
    const noteTweet = tweetResult.note_tweet?.note_tweet_results?.result || {};
    fullText = noteTweet.text || legacy.full_text || details.full_text || '';
  }

  // Collect primary URL entities & Media entities for rich markdown conversion
  const primaryUrlEntities: UrlEntity[] = [
    ...(legacy.entities?.urls || []),
    ...(tweetResult.url_entities || []),
    ...(tweetResult.note_tweet?.note_tweet_results?.result?.entity_set?.urls || []),
  ];
  const primaryMediaEntities: Array<{ url?: string; media_url_https?: string; type?: string; video_info?: any }> = [
    ...(legacy.extended_entities?.media || []),
    ...(legacy.entities?.media || []),
    ...(Array.isArray(tweetResult.media_entities2) ? tweetResult.media_entities2 : []),
  ];

  // Retweet info (supports legacy.retweeted_status_result and x-web retweeted_status_results)
  const rawRtWrapper =
    legacy.retweeted_status_result ||
    tweetResult.retweeted_status_result ||
    tweetResult.retweeted_status_results;
  const isRetweet = Boolean(rawRtWrapper);
  let retweetedAuthor = '';
  let retweetedText = '';
  const rtUrlEntities: UrlEntity[] = [];
  const rtMediaEntities: Array<{ url?: string }> = [];

  if (isRetweet) {
    let rtResult = rawRtWrapper?.result || {};
    if (rtResult.__typename === 'TweetWithVisibilityResults') {
      rtResult = rtResult.tweet || {};
    }
    const rtLegacy = rtResult.legacy || {};
    const rtDetails = rtResult.details || {};
    const rtUser = rtResult.core?.user_results?.result || {};
    retweetedAuthor = rtUser.core?.screen_name || rtUser.legacy?.screen_name || '';
    if (rtLegacy.entities?.urls) rtUrlEntities.push(...rtLegacy.entities.urls);
    if (Array.isArray(rtResult.url_entities)) rtUrlEntities.push(...rtResult.url_entities);
    if (rtLegacy.extended_entities?.media) rtMediaEntities.push(...rtLegacy.extended_entities.media);
    else if (rtLegacy.entities?.media) rtMediaEntities.push(...rtLegacy.entities.media);
    if (Array.isArray(rtResult.media_entities2)) rtMediaEntities.push(...rtResult.media_entities2);

    // 智能提取被转推内容的专栏长文 (X Article) 或 Note Tweet
    if (rtResult.article?.article_results?.result) {
      const art = formatArticleContent(rtResult.article.article_results.result, embeddedTweets);
      if (art.text) {
        retweetedText = art.text;
        for (const u of art.mediaUrls) {
          if (!mediaUrls.includes(u)) mediaUrls.push(u);
        }
      }
    } else if (rtResult.note_tweet?.note_tweet_results?.result?.text) {
      retweetedText = rtResult.note_tweet.note_tweet_results.result.text;
    } else if (rtLegacy.full_text || rtDetails.full_text) {
      retweetedText = rtLegacy.full_text || rtDetails.full_text;
    }
  }

  // Quote info (supports quoted_status_result and x-web quoted_status_results)
  const rawQtWrapper = tweetResult.quoted_status_result || tweetResult.quoted_status_results;
  const isQuote = Boolean(legacy.is_quote_status || rawQtWrapper);
  let quotedAuthor = '';
  let quotedText = '';
  const qtUrlEntities: UrlEntity[] = [];
  const qtMediaEntities: Array<{ url?: string }> = [];

  if (isQuote && rawQtWrapper) {
    let qResult = rawQtWrapper?.result || {};
    if (qResult.__typename === 'TweetWithVisibilityResults') {
      qResult = qResult.tweet || {};
    }
    const qLegacy = qResult.legacy || {};
    const qDetails = qResult.details || {};
    const qUser = qResult.core?.user_results?.result || {};
    quotedAuthor = qUser.core?.screen_name || qUser.legacy?.screen_name || '';
    quotedText = qLegacy.full_text || qDetails.full_text || '';

    if (qLegacy.entities?.urls) qtUrlEntities.push(...qLegacy.entities.urls);
    if (Array.isArray(qResult.url_entities)) qtUrlEntities.push(...qResult.url_entities);
    if (qLegacy.extended_entities?.media) qtMediaEntities.push(...qLegacy.extended_entities.media);
    else if (qLegacy.entities?.media) qtMediaEntities.push(...qLegacy.entities.media);
    if (Array.isArray(qResult.media_entities2)) qtMediaEntities.push(...qResult.media_entities2);

    // 智能提取被引用内容的专栏长文 (X Article) 或 Note Tweet
    if (qResult.article?.article_results?.result) {
      const art = formatArticleContent(qResult.article.article_results.result, embeddedTweets);
      if (art.text) {
        quotedText = art.text;
        for (const u of art.mediaUrls) {
          if (!mediaUrls.includes(u)) mediaUrls.push(u);
        }
      }
    } else if (qResult.note_tweet?.note_tweet_results?.result?.text) {
      quotedText = qResult.note_tweet.note_tweet_results.result.text;
    }
  }

  // Format texts with Markdown links and clean media attachments
  fullText = formatTweetTextWithMarkdownUrls(fullText, primaryUrlEntities, primaryMediaEntities);
  if (retweetedText) {
    retweetedText = formatTweetTextWithMarkdownUrls(retweetedText, rtUrlEntities, rtMediaEntities);
  }
  if (quotedText) {
    quotedText = formatTweetTextWithMarkdownUrls(quotedText, qtUrlEntities, qtMediaEntities);
  }

  // Media items extraction (including videos and GIFs)
  let videoUrl: string | undefined = undefined;
  let videoPoster: string | undefined = undefined;

  const allMediaContainers = [
    primaryMediaEntities,
    rtMediaEntities,
    qtMediaEntities,
  ];

  for (const container of allMediaContainers) {
    if (!Array.isArray(container)) continue;
    for (const m of container as any[]) {
      if (m.media_url_https && !mediaUrls.includes(m.media_url_https)) {
        mediaUrls.push(m.media_url_https);
      }
      if (m.type === 'video' || m.type === 'animated_gif') {
        if (!videoPoster && m.media_url_https) {
          videoPoster = m.media_url_https;
        }
        const variants = m.video_info?.variants || [];
        const mp4s = variants.filter((v: any) => v.content_type === 'video/mp4');
        if (mp4s.length > 0) {
          mp4s.sort(
            (a: any, b: any) =>
              Number(b.bit_rate ?? b.bitrate ?? 0) - Number(a.bit_rate ?? a.bitrate ?? 0)
          );
          const bestUrl = mp4s[0].url;
          if (bestUrl) {
            if (!videoUrl) videoUrl = bestUrl;
            if (!mediaUrls.includes(bestUrl)) {
              mediaUrls.push(bestUrl);
            }
          }
        }
      }
    }
  }

  const urls: string[] = [];
  for (const u of primaryUrlEntities) {
    if (u.expanded_url && !urls.includes(u.expanded_url)) {
      urls.push(u.expanded_url);
    }
  }

  const isArticle = Boolean(
    tweetResult.article?.article_results?.result ||
      primaryUrlEntities.some((u) => /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(u.expanded_url || u.url || '')) ||
      (fullText && /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(fullText)) ||
      fullText.startsWith('# ')
  );
  const isNoteTweet = Boolean(
    tweetResult.note_tweet?.note_tweet_results?.result ||
      fullText.length > 280 ||
      /…\s*https:\/\/t\.co\/\S+$/i.test(fullText) ||
      /\.\.\.\s*https:\/\/t\.co\/\S+$/i.test(fullText)
  );

  const rawCreatedAt =
    legacy.created_at ||
    (details.created_at_ms !== undefined && details.created_at_ms !== null
      ? new Date(Number(details.created_at_ms)).toISOString()
      : undefined);

  return {
    tweet_id: String(tweetResult.rest_id || legacy.id_str || ''),
    author_id: String(authorId),
    author_name: authorName,
    author_username: authorUsername,
    text: fullText,
    created_at: normalizeTweetDate(rawCreatedAt),
    is_retweet: isRetweet,
    retweeted_author: retweetedAuthor,
    retweeted_text: retweetedText,
    is_quote: isQuote,
    quoted_author: quotedAuthor,
    quoted_text: quotedText,
    like_count: Number(legacy.favorite_count ?? counts.favorite_count ?? 0),
    retweet_count: Number(legacy.retweet_count ?? counts.retweet_count ?? 0),
    reply_count: Number(legacy.reply_count ?? counts.reply_count ?? 0),
    view_count: Number(tweetResult.views?.count || 0),
    urls,
    media_urls: mediaUrls,
    video_url: videoUrl,
    video_poster: videoPoster,
    is_note_tweet: isNoteTweet,
    is_article: isArticle,
  };
}

/**
 * 合并同一推文的多段 SSR / GraphQL 局部载荷（例如 x-web TanStack Router SSR 会将
 * 元数据 counts/details 与完整文章 content_state 拆在两个 Result.Ok 块中下发）。
 */
export function mergeRawTweetPayload(existing: any, incoming: any, fallbackRestId?: string): any {
  const unwrap = (raw: any) =>
    raw?.__typename === 'TweetWithVisibilityResults' ? raw.tweet || {} : raw || {};
  const a = unwrap(existing);
  const b = unwrap(incoming);

  const mergedRestId = String(b.rest_id || a.rest_id || fallbackRestId || '');

  const aArt = a.article?.article_results?.result;
  const bArt = b.article?.article_results?.result;
  let mergedArticle = b.article || a.article;
  if (aArt || bArt) {
    const aBlocks = Array.isArray(aArt?.content_state?.blocks) ? aArt.content_state.blocks.length : 0;
    const bBlocks = Array.isArray(bArt?.content_state?.blocks) ? bArt.content_state.blocks.length : 0;
    const primaryArt = bBlocks >= aBlocks ? bArt : aArt;
    const secondaryArt = bBlocks >= aBlocks ? aArt : bArt;
    mergedArticle = {
      ...(secondaryArt ? a.article || b.article : {}),
      ...(bBlocks >= aBlocks ? b.article : a.article),
      article_results: {
        ...(bBlocks >= aBlocks ? b.article?.article_results : a.article?.article_results),
        result: {
          ...(secondaryArt || {}),
          ...(primaryArt || {}),
          cover_media: primaryArt?.cover_media || secondaryArt?.cover_media,
          cover_media_results: primaryArt?.cover_media_results || secondaryArt?.cover_media_results,
          media_entities:
            Array.isArray(primaryArt?.media_entities) && primaryArt.media_entities.length > 0
              ? primaryArt.media_entities
              : secondaryArt?.media_entities,
          media_entities_results:
            Array.isArray(primaryArt?.media_entities_results) && primaryArt.media_entities_results.length > 0
              ? primaryArt.media_entities_results
              : secondaryArt?.media_entities_results,
        },
      },
    };
  }

  const aUser = a.core?.user_results?.result;
  const bUser = b.core?.user_results?.result;
  const mergedCore =
    aUser || bUser
      ? {
          ...(a.core || {}),
          ...(b.core || {}),
          user_results: {
            ...(a.core?.user_results || {}),
            ...(b.core?.user_results || {}),
            result: {
              ...(aUser || {}),
              ...(bUser || {}),
              core: { ...(aUser?.core || {}), ...(bUser?.core || {}) },
              legacy: { ...(aUser?.legacy || {}), ...(bUser?.legacy || {}) },
            },
          },
        }
      : b.core || a.core;

  return {
    ...a,
    ...b,
    rest_id: mergedRestId || undefined,
    core: mergedCore,
    counts: a.counts || b.counts ? { ...(a.counts || {}), ...(b.counts || {}) } : undefined,
    details: a.details || b.details ? { ...(a.details || {}), ...(b.details || {}) } : undefined,
    legacy:
      a.legacy || b.legacy
        ? {
            ...(a.legacy || {}),
            ...(b.legacy || {}),
            entities: { ...(a.legacy?.entities || {}), ...(b.legacy?.entities || {}) },
            extended_entities: b.legacy?.extended_entities || a.legacy?.extended_entities,
          }
        : undefined,
    views: b.views?.count ? b.views : a.views || b.views,
    media_entities2:
      Array.isArray(b.media_entities2) && b.media_entities2.length > 0
        ? b.media_entities2
        : a.media_entities2 || b.media_entities2,
    url_entities:
      Array.isArray(b.url_entities) && b.url_entities.length > 0
        ? b.url_entities
        : a.url_entities || b.url_entities,
    note_tweet: b.note_tweet || a.note_tweet,
    quoted_status_result: b.quoted_status_result || a.quoted_status_result,
    article: mergedArticle,
  };
}

/**
 * 从 X 新版前端 `x-web`（TanStack Router SSR）HTML 中解码全部 `Result.Ok` JSON 载荷。
 */
export function extractSsrPayloadsFromHtml(html: string): any[] {
  const payloads: any[] = [];
  if (!html || !html.includes('Result.Ok')) return payloads;

  const regex = /kind:"Result\.Ok",value:"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      // JS 字符串字面量转合法 JSON 字符串：\xHH -> \u00HH，\' -> '
      const normalizedLiteral = match[1]
        .replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')
        .replace(/\\'/g, "'");
      const decodedJsonText = JSON.parse(`"${normalizedLiteral}"`);
      const payload = JSON.parse(decodedJsonText);
      if (payload && typeof payload === 'object') {
        payloads.push(payload);
      }
    } catch {
      // 跳过非 JSON 或无法解析的 SSR 分片
    }
  }
  return payloads;
}

/**
 * 从 X 新版前端 `x-web`（TanStack Router SSR）HTML 中提取所有内联 `Result.Ok` 推文/专栏原始载荷，
 * 并按 rest_id 合并分片结果（如元数据分片 + 完整文章 content_state 分片 + 内嵌推文分片）。
 */
export function extractSsrTweetPayloadsFromHtml(html: string): Map<string, any> {
  const mergedById = new Map<string, any>();
  for (const payload of extractSsrPayloadsFromHtml(html)) {
    const data = payload?.data;
    if (!data || typeof data !== 'object') continue;

    const candidates = [data.tweet_result_by_rest_id, data.tweetResult];
    for (const wrapper of candidates) {
      if (!wrapper) continue;
      const list = Array.isArray(wrapper) ? wrapper : [wrapper];
      for (const item of list) {
        const rawResult = item?.result;
        if (!rawResult || typeof rawResult !== 'object') continue;
        const inner =
          rawResult.__typename === 'TweetWithVisibilityResults' ? rawResult.tweet : rawResult;
        const restId = String(inner?.rest_id || item?.rest_id || '').trim();
        if (!restId) continue;

        const existing = mergedById.get(restId);
        mergedById.set(
          restId,
          existing ? mergeRawTweetPayload(existing, rawResult, restId) : mergeRawTweetPayload(null, rawResult, restId)
        );
      }
    }
  }

  return mergedById;
}

/**
 * 从 X 新版前端 `x-web` SSR HTML 中提取时间线推文（适用于 X 列表 / 博主主页 / 搜索结果首屏）。
 */
export function extractSsrTimelineTweetsFromHtml(html: string): Tweet[] {
  const seen = new Set<string>();
  const tweets: Tweet[] = [];
  for (const payload of extractSsrPayloadsFromHtml(html)) {
    const inst = extractTimelineInstructions(payload);
    if (inst.length === 0) continue;
    for (const t of parseTimelineInstructions(inst)) {
      if (t.tweet_id && !seen.has(t.tweet_id)) {
        seen.add(t.tweet_id);
        tweets.push(t);
      }
    }
  }
  return tweets;
}

/**
 * Extracts tweets from timeline instructions, filtering ads and cursors.
 * Supports both legacy schema (type / entryId / itemContent / moduleItems)
 * and x-web schema (__typename / entry_id / content / module_items / TimelinePinEntry).
 */
export function parseTimelineInstructions(instructions: any[]): Tweet[] {
  const parsedTweets: Tweet[] = [];
  if (!Array.isArray(instructions)) return parsedTweets;

  for (const instruction of instructions) {
    const type = instruction?.type || instruction?.__typename;
    let entries: any[] = [];
    if (type === 'TimelineAddEntries') {
      entries = instruction.entries || [];
    } else if (type === 'TimelineAddToModule') {
      entries = instruction.moduleItems || instruction.module_items || [];
    } else if (type === 'TimelinePinEntry' && instruction.entry) {
      entries = [instruction.entry];
    }

    for (const entry of entries) {
      const entryId = String(entry?.entryId || entry?.entry_id || '').toLowerCase();
      // Skip promoted ads and cursors
      if (entryId.includes('promoted') || entryId.startsWith('cursor-')) {
        continue;
      }

      const content = entry?.content || {};
      const itemContent = content.itemContent || content.content || {};
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
        const subIc = subItem?.item?.itemContent || subItem?.item?.content || {};
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
  if (d.list_by_rest_id_v2?.tweets_timeline?.timeline?.instructions) {
    return d.list_by_rest_id_v2.tweets_timeline.timeline.instructions;
  }
  if (d.user?.result?.timeline?.timeline?.instructions) {
    return d.user.result.timeline.timeline.instructions;
  }
  if (d.user?.result?.timeline_v2?.timeline?.instructions) {
    return d.user.result.timeline_v2.timeline.instructions;
  }
  if (d.user_result_by_screen_name?.result?.profile_user_originals_timeline?.timeline?.instructions) {
    return d.user_result_by_screen_name.result.profile_user_originals_timeline.timeline.instructions;
  }
  if (d.home?.home_timeline_urt?.instructions) {
    return d.home.home_timeline_urt.instructions;
  }
  if (d.home_timeline?.timeline?.instructions) {
    return d.home_timeline.timeline.instructions;
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
  if (tweet.is_article) return true;
  // 1. Check if urls contains an official article link
  const hasArticleUrl = Boolean(
    tweet.urls?.some((u) => /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(u))
  );
  // 2. Check if text explicitly contains an article link
  const hasArticleInText = Boolean(
    tweet.text && /(?:x\.com|twitter\.com)\/i\/article\/\d+/i.test(tweet.text)
  );
  // 3. Check if text starts with markdown title header formatted from articleResult
  const hasArticleTitleHeader = Boolean(tweet.text && tweet.text.startsWith('# '));
  return hasArticleUrl || hasArticleInText || hasArticleTitleHeader;
}

/**
 * Determines whether a tweet is a Note Tweet (long-form post > 280 chars or note_tweet payload).
 */
export function isNoteTweet(tweet: Partial<Tweet>): boolean {
  if (!tweet) return false;
  if (tweet.is_note_tweet) return true;
  if (tweet.text && tweet.text.length > 280) return true;
  // Check if truncated note tweet preview
  if (tweet.text) {
    const trimmed = tweet.text.trim();
    if (
      trimmed.length <= 400 &&
      (/…\s*https:\/\/t\.co\/\S+$/i.test(trimmed) || /\.\.\.\s*https:\/\/t\.co\/\S+$/i.test(trimmed))
    ) {
      return true;
    }
  }
  // Check official note links
  if (tweet.urls?.some((u) => /(?:x\.com|twitter\.com)\/i\/notes\/\d+/i.test(u))) {
    return true;
  }
  return false;
}

/**
 * Determines whether a tweet is a long content tweet (either Note Tweet or X Article).
 */
export function isLongContentTweet(tweet: Partial<Tweet>): boolean {
  return isArticleTweet(tweet) || isNoteTweet(tweet);
}

/**
 * Classifies a tweet into one mutually exclusive content type with priority: article > note > short.
 */
export function classifyTweetContentType(tweet: Partial<Tweet>): TweetContentType {
  if (isArticleTweet(tweet)) return 'article';
  if (isNoteTweet(tweet)) return 'note';
  return 'short';
}

/**
 * Checks whether a tweet matches any of the allowed content types.
 */
export function matchesContentTypes(
  tweet: Partial<Tweet>,
  allowedTypes: readonly TweetContentType[]
): boolean {
  if (!allowedTypes || allowedTypes.length === 0) return false;
  if (
    allowedTypes.includes('article') &&
    allowedTypes.includes('note') &&
    allowedTypes.includes('short')
  ) {
    return true;
  }
  return allowedTypes.includes(classifyTweetContentType(tweet));
}

/**
 * Parses and normalizes content type configuration from a comma-separated string or string array.
 * - Lenient mode (default): drops invalid entries, deduplicates in canonical order (article, note, short),
 *   and falls back to ['article'] if nothing valid remains.
 * - Strict mode (CLI): throws an explicit error on empty input or unknown content type tokens.
 */
export function parseContentTypes(
  raw: string | readonly string[] | undefined,
  options?: { strict?: boolean }
): TweetContentType[] {
  const strict = Boolean(options?.strict);
  const tokens = (
    Array.isArray(raw)
      ? raw.flatMap((item) => String(item).split(','))
      : typeof raw === 'string'
      ? raw.split(',')
      : []
  )
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) {
    if (strict) {
      throw new Error(
        `内容类型不能为空，请从以下合法类型中选择（逗号分隔）：${ALL_TWEET_CONTENT_TYPES.join(', ')}`
      );
    }
    return [...DEFAULT_TWEET_CONTENT_TYPES];
  }

  const validSet = new Set<TweetContentType>();
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    if ((ALL_TWEET_CONTENT_TYPES as readonly string[]).includes(token)) {
      validSet.add(token as TweetContentType);
    } else {
      invalidTokens.push(token);
    }
  }

  if (strict && invalidTokens.length > 0) {
    throw new Error(
      `无效的内容类型 '${invalidTokens.join(', ')}'。合法类型仅支持：${ALL_TWEET_CONTENT_TYPES.join(', ')}`
    );
  }

  if (validSet.size === 0) {
    return [...DEFAULT_TWEET_CONTENT_TYPES];
  }

  return ALL_TWEET_CONTENT_TYPES.filter((t) => validSet.has(t));
}

/**
 * Checks whether a tweet's content is truncated or incomplete and requires on-demand full sync.
 * Covers:
 * 1. Note Tweets truncated with ellipsis and t.co link
 * 2. X Articles where timeline only provided title/cover image instead of full multi-thousand-word body
 */
export function isTweetContentIncomplete(tweet: Partial<Tweet>): boolean {
  if (!tweet || !tweet.text) return true;

  const trimmedText = tweet.text.trim();

  // 1. Truncated Note Tweet check:
  // Twitter truncates long-form Note Tweets (>280 chars) by inserting an ellipsis followed by a t.co link (… https://t.co/...).
  // Only tweets within Twitter's timeline limit (<= 400 chars) can be truncated previews.
  // Short tweets with media naturally end with a plain t.co link WITHOUT ellipsis and are complete.
  if (trimmedText.length <= 400) {
    const isTruncatedNote = Boolean(
      /…\s*https:\/\/t\.co\/\S+$/i.test(trimmedText) ||
        /\.\.\.\s*https:\/\/t\.co\/\S+$/i.test(trimmedText)
    );
    if (isTruncatedNote) return true;
  }

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
