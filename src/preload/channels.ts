/**
 * IPC channel names shared between Electron Main process and Preload/Renderer.
 */
export const IPC_CHANNELS = {
  // Auth & Session
  AUTH_CHECK: 'auth:check',
  AUTH_LOGIN: 'auth:login',

  // Configuration
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',

  // Trends & Digest
  TRENDS_FETCH: 'trends:fetch',
  TRENDS_DIGEST: 'trends:digest',
  DIGEST_DAILY: 'digest:daily',

  // Tweets & Timeline
  TWEETS_FETCH_FOLLOWING: 'tweets:fetch-following',
  TWEETS_FETCH_USER: 'tweets:fetch-user',
  TWEETS_FETCH_LIST: 'tweets:fetch-list',
  TWEETS_SEARCH: 'tweets:search',
  TWEETS_LIST: 'tweets:list',
  TWEETS_VIEW: 'tweets:view',
  TWEETS_DELETE: 'tweets:delete',
  TWEETS_EXPORT: 'tweets:export',

  // Window Controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Real-time Event Streaming (Main -> Renderer)
  STREAM_EVENT: 'stream:event',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
