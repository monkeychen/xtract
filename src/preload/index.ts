import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './channels.js';
import type { Tweet, TrendTopic, DeleteFilter, DeleteResult, XListInfo, TweetQueryOptions } from '../main/types.js';

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
  onlyLongTweets: boolean;
  fetchAuthorReplies: boolean;
  storageRoot: string;
  dataDir: string;
  articlesDir: string;
  reportsDir: string;
  configEnvPath: string;
}

export interface BrowserImportResult {
  success: boolean;
  importedCount?: number;
  account?: string;
  message?: string;
}

/** 设置页「创建命令行快捷方式」结果。message 为面向用户的中文状态。 */
export interface CliShortcutResult {
  ok: boolean;
  linkPath?: string;
  targetPath?: string;
  /** 本次是否执行了 PATH 自动修复 */
  pathFixed: boolean;
  /** PATH 未能自动处理时的手动指引 */
  pathHint?: string;
  /** 命令入口已存在且指向正确（幂等重复点击） */
  alreadyExists?: boolean;
  message: string;
}

export interface XtractAPI {
  // Auth & Session
  checkAuth: () => Promise<{ isValid: boolean; info?: string; screenName?: string; proxy?: string; error?: string }>;
  /** 从用户日常浏览器读取既有 X 登录态。返回值绝不包含任何 cookie 明文。 */
  importFromBrowser: () => Promise<BrowserImportResult>;

  // CLI Shortcut
  /** 在 ~/bin 创建 xtract 命令入口（macOS 符号链接 / Windows .cmd shim），仅安装版可用 */
  createCliShortcut: () => Promise<CliShortcutResult>;

  // Configuration
  getConfig: () => Promise<AppConfigView>;
  updateConfig: (updates: Record<string, string>) => Promise<{ success: boolean; config: AppConfigView }>;

  // Trends & Digest
  getTrends: (
    category?: string,
    top?: number,
    refresh?: boolean
  ) => Promise<TrendTopic[] & { updatedAt?: string | null; fromCache?: boolean }>;
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
  fetchFollowing: (options?: { pages?: number; limit?: number }) => Promise<{ fetched: number; inserted: number; skipped: number }>;
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
  listTweets: (options?: TweetQueryOptions) => Promise<Tweet[]>;
  countTweets: (options?: TweetQueryOptions) => Promise<number>;
  viewTweet: (
    tweetIdOrUrl: string,
    options?: { exportMd?: boolean; outputPath?: string; forceRefresh?: boolean }
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
  selectDirectory: (defaultPath?: string) => Promise<string | null>;

  // Real-time Event Streaming
  onStreamEvent: (callback: (event: StreamEvent) => void) => () => void;
}

export const xtractApiImplementation: XtractAPI = {
  checkAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK),
  importFromBrowser: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_IMPORT_FROM_BROWSER),
  createCliShortcut: () => ipcRenderer.invoke(IPC_CHANNELS.CLI_CREATE_SHORTCUT),

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
  countTweets: (options) => ipcRenderer.invoke(IPC_CHANNELS.TWEETS_COUNT, options),
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
  selectDirectory: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, defaultPath),

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
