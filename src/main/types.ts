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
  source_type?: 'following' | 'search' | 'trends' | 'user' | 'list';
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
  username?: string;
  since?: string;
  until?: string;
  olderThan?: string;
  dryRun?: boolean;
}

export interface DeleteResult {
  matchedCount: number;
  deletedCount: number;
  deletedDirs: string[];
  deletedFiles: string[];
  dryRun: boolean;
}

