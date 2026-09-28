import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './channels.js';
import type { Tweet, TrendTopic, DeleteFilter, DeleteResult, XListInfo } from '../main/types.js';

export interface StreamEvent {
  taskId: string;
  stage: 'init' | 'refine_query' | 'fetch' | 'reasoning' | 'synthesis' | 'done' | 'error';
  type?: 'reasoning' | 'content' | 'status';
  text?: string;
  progress?: number;
  meta?: Record<string, unknown>;
}

export interface AppConfigView {
  httpProxy: string;
  llmProvider: string;
  llmAuthMode: string;
  llmModel: string;
  reasoningEnabled: boolean;
  reasoningEffort: 'low' | 'medium' | 'high';
  hasXCredentials: boolean;
  xAuthTokenMasked: string;
  xCt0Masked: string;
}

export interface XtractAPI {
  // Auth & Session
  checkAuth: () => Promise<{ isValid: boolean; info?: string; screenName?: string; proxy?: string; error?: string }>;
  login: (service?: 'x' | 'openai' | 'gemini') => Promise<{ success: boolean; error?: string }>;

  // Configuration
  getConfig: () => Promise<AppConfigView>;
  updateConfig: (updates: Record<string, string>) => Promise<{ success: boolean; config: AppConfigView }>;

  // Trends & Digest
  getTrends: (category?: string, top?: number, refresh?: boolean) => Promise<TrendTopic[]>;
  generateTrendsDigest: (options?: {
    category?: string;
    top?: number;
    hours?: number;
    minLikes?: number;
    minRetweets?: number;
    provider?: string;
    authMode?: string;
    model?: string;
  }) => Promise<{ success: boolean; reportPath?: string; content?: string; error?: string }>;
  generateDailyDigest: (options?: {
    hours?: number;
    minLikes?: number;
    minRetweets?: number;
    provider?: string;
    authMode?: string;
    model?: string;
  }) => Promise<{ success: boolean; reportPath?: string; content?: string; error?: string }>;

  // Tweets & Timeline
  fetchFollowing: (options?: { pages?: number }) => Promise<{ fetched: number; inserted: number; skipped: number }>;
  fetchUser: (
    username: string,
    options?: { limit?: number }
  ) => Promise<{ fetched: number; inserted: number; skipped: number }>;
  fetchList: (
    listId: string,
    options?: { limit?: number }
  ) => Promise<{ fetched: number; inserted: number; skipped: number }>;
  searchTweets: (
    query: string,
    options?: { searchType?: 'live' | 'top'; limit?: number; minLikes?: number; minRetweets?: number }
  ) => Promise<{ count: number; tweets: Tweet[] }>;
  listTweets: (options?: {
    limit?: number;
    minLikes?: number;
    minRetweets?: number;
    user?: string;
    query?: string;
  }) => Promise<Tweet[]>;
  viewTweet: (
    tweetIdOrUrl: string,
    options?: { exportMd?: boolean; outputPath?: string }
  ) => Promise<{ tweet: Tweet; exportPath?: string }>;
  deleteTweets: (filter: DeleteFilter) => Promise<DeleteResult>;
  exportTweets: (
    limit?: number,
    options?: { outputPath?: string; minLikes?: number; minRetweets?: number }
  ) => Promise<{ outputPath: string; count: number }>;

  // Lists Management
  getUserLists: () => Promise<XListInfo[]>;
  saveUserList: (list: XListInfo) => Promise<{ success: boolean; lists: XListInfo[] }>;
  fetchOnlineLists: () => Promise<XListInfo[]>;

  // Window Controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // Shell & Native OS Integration
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  showItemInFolder: (itemPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  openPath: (dirPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;

  // Real-time Event Streaming
  onStreamEvent: (callback: (event: StreamEvent) => void) => () => void;
}

export const xtractApiImplementation: XtractAPI = {
  checkAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK),
  login: (service = 'x') => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, service),

  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  updateConfig: (updates) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_UPDATE, updates),

  getTrends: (category, top, refresh) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRENDS_FETCH, { category, top, refresh }),
  generateTrendsDigest: (options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRENDS_DIGEST, options),
  generateDailyDigest: (options) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIGEST_DAILY, options),

  fetchFollowing: (options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TWEETS_FETCH_FOLLOWING, options),
  fetchUser: (username, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TWEETS_FETCH_USER, { username, ...options }),
  fetchList: (listId, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TWEETS_FETCH_LIST, { listId, ...options }),
  searchTweets: (query, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TWEETS_SEARCH, { query, ...options }),
  listTweets: (options) => ipcRenderer.invoke(IPC_CHANNELS.TWEETS_LIST, options),
  viewTweet: (tweetIdOrUrl, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TWEETS_VIEW, { tweetIdOrUrl, ...options }),
  deleteTweets: (filter) => ipcRenderer.invoke(IPC_CHANNELS.TWEETS_DELETE, filter),
  exportTweets: (limit, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.TWEETS_EXPORT, { limit, ...options }),

  getUserLists: () => ipcRenderer.invoke(IPC_CHANNELS.LISTS_GET_USER_LISTS),
  saveUserList: (list) => ipcRenderer.invoke(IPC_CHANNELS.LISTS_SAVE_USER_LIST, list),
  fetchOnlineLists: () => ipcRenderer.invoke(IPC_CHANNELS.LISTS_FETCH_ONLINE),

  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url),
  showItemInFolder: (itemPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, itemPath),
  openPath: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, dirPath),

  onStreamEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: StreamEvent) => {
      callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.STREAM_EVENT, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STREAM_EVENT, listener);
    };
  },
};

// Expose safe API to the Renderer execution context
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('xtractAPI', xtractApiImplementation);
  } catch (error) {
    console.error('Failed to expose xtractAPI in main world:', error);
  }
} else if (typeof window !== 'undefined') {
  // Fallback if context isolation is disabled
  (window as any).xtractAPI = xtractApiImplementation;
}

declare global {
  interface Window {
    xtractAPI: XtractAPI;
  }
}
