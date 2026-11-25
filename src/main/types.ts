export type TweetContentType = 'article' | 'note' | 'short';

export const ALL_TWEET_CONTENT_TYPES: readonly TweetContentType[] = ['article', 'note', 'short'];
export const DEFAULT_TWEET_CONTENT_TYPES: readonly TweetContentType[] = ['article'];

export interface TweetVideoItem {
  url: string;
  posterUrl?: string;
}

export interface LocalVideoStatus {
  downloaded: boolean;
  localPath?: string;
  mediaUrl?: string;
  sizeBytes?: number;
}

export interface VideoDownloadResult {
  success: boolean;
  videoUrl: string;
  localPath?: string;
  mediaUrl?: string;
  sizeBytes?: number;
  alreadyExisted?: boolean;
  canceled?: boolean;
  error?: string;
}

export interface Tweet {
  tweet_id: string;
  author_id?: string;
  author_name: string;
  author_username: string;
  text: string;
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count?: number;
  quote_count?: number;
  view_count?: number;
  is_retweet?: boolean;
  retweeted_author?: string;
  retweeted_text?: string;
  is_quote?: boolean;
  quoted_author?: string;
  quoted_text?: string;
  urls?: string[];
  media_urls?: string[];
  video_url?: string;
  video_poster?: string;
  is_note_tweet?: boolean;
  is_article?: boolean;
  source_type?: 'following' | 'search' | 'trends' | 'user' | 'list' | 'legacy';
  list_id?: string;
  fetched_at?: string;
}

export interface TrendTopic {
  rank: number;
  name: string;
  domain?: string;
  tweet_count?: string | number;
  raw_title?: string;
  query?: string;
  category?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  type: 'reasoning' | 'content';
  text: string;
}

export interface DeleteFilter {
  tweetId?: string;
  tweetIds?: string[];
  username?: string;
  since?: string;
  until?: string;
  olderThan?: string;
  onlyShortTweets?: boolean;
  dryRun?: boolean;
}

export type TweetSortBy = 'created_at' | 'fetched_at' | 'likes' | 'views';

export interface TweetQueryOptions {
  limit?: number;
  offset?: number;
  minLikes?: number;
  minRetweets?: number;
  sourceType?: 'following' | 'search' | 'trends' | 'user' | 'list' | 'legacy' | 'all';
  user?: string;
  query?: string;
  listId?: string;
  sortBy?: TweetSortBy;
}

export interface DeleteResult {
  matchedCount: number;
  deletedCount: number;
  deletedDirs: string[];
  deletedFiles: string[];
  dryRun: boolean;
}

export interface XListInfo {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
  is_pinned?: boolean;
}

