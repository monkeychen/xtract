import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, BrowserWindow, shell } from 'electron';
import { IPC_CHANNELS } from '../../preload/channels.js';
import type { StreamEvent, AppConfigView } from '../../preload/index.js';
import { Config } from '../config.js';
import { Storage } from '../storage/index.js';
import { XClient } from '../client/index.js';
import { Pipeline } from '../pipeline/index.js';
import type { Tweet, DeleteFilter, DeleteResult, XListInfo } from '../types.js';

let isRegistered = false;

export function _resetRegisteredForTest(): void {
  isRegistered = false;
}

export function registerIpcHandlers(
  mainWindow?: BrowserWindow,
  options?: { force?: boolean }
): void {
  if (isRegistered && !options?.force) {
    return;
  }
  isRegistered = true;

  const storage = new Storage();
  const pipeline = new Pipeline(storage);

  // Helper for masking sensitive tokens
  const mask = (s: string) =>
    s && s.length > 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : s ? '****' : '';

  // 1. Auth & Session
  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK, async () => {
    try {
      const client = new XClient(20);
      const auth = await client.verifyAuth();
      return {
        isValid: true,
        info: `@${auth.screen_name}`,
        screenName: auth.screen_name,
        name: auth.name,
        proxy: Config.HTTP_PROXY || undefined,
      };
    } catch (err: any) {
      return {
        isValid: false,
        error: err?.message || String(err),
        proxy: Config.HTTP_PROXY || undefined,
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_event, service: 'x' | 'openai' | 'gemini' = 'x') => {
      try {
        if (service === 'x') {
          const client = new XClient();
          await client.loginInteractive(120);
          return { success: true };
        }
        return {
          success: false,
          error: `登录目标服务【${service}】当前可通过终端快速完成捕获`,
        };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }
  );

  // 2. Configuration
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (): Promise<AppConfigView> => {
    return {
      httpProxy: Config.HTTP_PROXY,
      llmProvider: Config.LLM_PROVIDER,
      llmAuthMode: Config.LLM_AUTH_MODE,
      llmModel: Config.LLM_MODEL,
      reasoningEnabled: Config.LLM_REASONING_ENABLED,
      reasoningEffort: Config.LLM_REASONING_EFFORT,
      hasXCredentials: Config.hasXCredentials(),
      xAuthTokenMasked: mask(Config.X_AUTH_TOKEN),
      xCt0Masked: mask(Config.X_CT0),
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_UPDATE,
    async (_event, updates: Record<string, string>) => {
      const envPath = path.join(Config.PROJECT_ROOT, '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

      for (const [key, value] of Object.entries(updates)) {
        process.env[key] = value;
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }

      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');

      return {
        success: true,
        config: {
          httpProxy: process.env.HTTP_PROXY || Config.HTTP_PROXY,
          llmProvider: process.env.LLM_PROVIDER || Config.LLM_PROVIDER,
          llmAuthMode: process.env.LLM_AUTH_MODE || Config.LLM_AUTH_MODE,
          llmModel: process.env.LLM_MODEL || Config.LLM_MODEL,
          reasoningEnabled: Config.LLM_REASONING_ENABLED,
          reasoningEffort: Config.LLM_REASONING_EFFORT,
          hasXCredentials: Config.hasXCredentials(),
          xAuthTokenMasked: mask(process.env.X_AUTH_TOKEN || Config.X_AUTH_TOKEN),
          xCt0Masked: mask(process.env.X_CT0 || Config.X_CT0),
        },
      };
    }
  );

  // 3. Trends & Digest
  ipcMain.handle(
    IPC_CHANNELS.TRENDS_FETCH,
    async (_event, args?: { category?: string; top?: number; refresh?: boolean }) => {
      const category = args?.category || 'tech';
      const top = args?.top || 10;

      // 1. Check local cache first if not explicitly asked to refresh
      if (!args?.refresh) {
        const cached = storage.getCachedTrends(category);
        if (cached && cached.trends.length > 0) {
          const list: any = cached.trends.slice(0, top);
          list.updatedAt = cached.updatedAt;
          list.fromCache = true;
          return list;
        }
      }

      // 2. Fetch fresh trends from X
      const client = new XClient();
      const fresh = await client.fetchExploreTrends({
        category,
        top,
      });

      storage.saveCachedTrends(category, fresh);
      const list: any = fresh.slice(0, top);
      list.updatedAt = new Date().toISOString();
      list.fromCache = false;
      return list;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TRENDS_DIGEST,
    async (event, options?: {
      category?: string;
      top?: number;
      hours?: number;
      minLikes?: number;
      minRetweets?: number;
      provider?: string;
      authMode?: string;
      model?: string;
    }) => {
      const taskId = `trends_${Date.now()}`;
      try {
        const reportPath = await pipeline.runTrendsDigest({
          ...options,
          onProgress: (p) => {
            const streamEv: StreamEvent = {
              taskId,
              stage: p.stage as any,
              type: 'status',
              text: p.message,
              progress: p.progress,
              meta: p.meta,
            };
            event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
          },
          onChunk: (chunk) => {
            const streamEv: StreamEvent = {
              taskId,
              stage: chunk.type === 'reasoning' ? 'reasoning' : 'synthesis',
              type: chunk.type,
              text: chunk.text,
            };
            event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
          },
        });

        if (!reportPath || !fs.existsSync(reportPath)) {
          return { success: false, error: '研报未能生成' };
        }

        const content = fs.readFileSync(reportPath, 'utf-8');
        return { success: true, reportPath, content };
      } catch (err: any) {
        const streamEv: StreamEvent = {
          taskId,
          stage: 'error',
          type: 'status',
          text: err?.message || String(err),
        };
        event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
        return { success: false, error: err?.message || String(err) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DIGEST_DAILY,
    async (event, options?: {
      hours?: number;
      minLikes?: number;
      minRetweets?: number;
      provider?: string;
      authMode?: string;
      model?: string;
    }) => {
      const taskId = `daily_${Date.now()}`;
      try {
        const reportPath = await pipeline.generateReport({
          ...options,
          onProgress: (p) => {
            const streamEv: StreamEvent = {
              taskId,
              stage: p.stage as any,
              type: 'status',
              text: p.message,
              progress: p.progress,
              meta: p.meta,
            };
            event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
          },
          onChunk: (chunk) => {
            const streamEv: StreamEvent = {
              taskId,
              stage: chunk.type === 'reasoning' ? 'reasoning' : 'synthesis',
              type: chunk.type,
              text: chunk.text,
            };
            event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
          },
        });

        if (!reportPath || !fs.existsSync(reportPath)) {
          return { success: false, error: '早报未能生成（数据库可能缺少时间窗口内推文）' };
        }

        const content = fs.readFileSync(reportPath, 'utf-8');
        return { success: true, reportPath, content };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }
  );

  // 4. Tweets & Timeline
  ipcMain.handle(
    IPC_CHANNELS.TWEETS_FETCH_FOLLOWING,
    async (_event, options?: { pages?: number }) => {
      const [fetched, inserted, skipped] = await pipeline.fetchAndStore(options?.pages);
      return { fetched, inserted, skipped };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_FETCH_USER,
    async (_event, args: { username: string; limit?: number }) => {
      const tweets = await pipeline.fetchUserAndStore(args.username, args.limit);
      return { fetched: tweets.length, inserted: tweets.length, skipped: 0 };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_FETCH_LIST,
    async (_event, args: { listId: string; limit?: number }) => {
      const tweets = await pipeline.fetchListAndStore(args.listId, args.limit);
      return { fetched: tweets.length, inserted: tweets.length, skipped: 0 };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_SEARCH,
    async (
      _event,
      args: {
        query: string;
        searchType?: 'live' | 'top';
        limit?: number;
        minLikes?: number;
        minRetweets?: number;
      }
    ) => {
      const tweets = await pipeline.fetchSearchAndStore(args.query, {
        searchType: args.searchType,
        limit: args.limit,
        minLikes: args.minLikes,
        minRetweets: args.minRetweets,
      });
      return { count: tweets.length, tweets };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_LIST,
    async (
      _event,
      options?: {
        limit?: number;
        minLikes?: number;
        minRetweets?: number;
        user?: string;
        query?: string;
      }
    ): Promise<Tweet[]> => {
      if (options?.user) {
        return storage.getTweetsByUser(options.user, {
          limit: options.limit || 20,
          minLikes: options.minLikes || 0,
          minRetweets: options.minRetweets || 0,
        });
      }
      if (options?.query) {
        return storage.searchLocalTweets(options.query, {
          limit: options.limit || 20,
          minLikes: options.minLikes || 0,
          minRetweets: options.minRetweets || 0,
        });
      }
      return storage.getRecentTweets({
        limit: options?.limit || 20,
        minLikes: options?.minLikes || 0,
        minRetweets: options?.minRetweets || 0,
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_VIEW,
    async (
      _event,
      args: { tweetIdOrUrl: string; exportMd?: boolean; outputPath?: string }
    ) => {
      const cleanId = args.tweetIdOrUrl.match(/\d{5,}/)?.[0] || args.tweetIdOrUrl.trim();
      let tweet = storage.getTweetById(cleanId);

      // If missing or truncated short link, fetch fresh from network
      const isTruncated = Boolean(
        tweet?.text && tweet.text.length < 60 && tweet.text.includes('https://t.co/')
      );
      if (!tweet || isTruncated) {
        try {
          await pipeline.fetchTweetAndStore(cleanId);
          tweet = storage.getTweetById(cleanId);
        } catch (err: any) {
          if (!tweet) throw err;
        }
      }

      if (!tweet) {
        throw new Error(`未找到推文【${cleanId}】`);
      }

      let exportPath: string | undefined;
      if (args.exportMd !== false) {
        const { filePath } = await storage.exportSingleTweetMarkdown(cleanId, {
          outputPath: args.outputPath,
          downloadImages: true,
        });
        exportPath = filePath;
      }

      return { tweet, exportPath };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_DELETE,
    async (_event, filter: DeleteFilter): Promise<DeleteResult> => {
      return storage.deleteTweets(filter);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_EXPORT,
    async (
      _event,
      args?: { limit?: number; outputPath?: string; minLikes?: number; minRetweets?: number }
    ) => {
      const filePath = storage.exportMarkdown({
        outputFile: args?.outputPath,
        limit: args?.limit || 200,
        minLikes: args?.minLikes || 0,
        minRetweets: args?.minRetweets || 0,
      });
      return { outputPath: filePath, count: args?.limit || 200 };
    }
  );

  // 5. Lists Management
  ipcMain.handle(IPC_CHANNELS.LISTS_GET_USER_LISTS, async () => {
    return Config.getUserLists();
  });

  ipcMain.handle(IPC_CHANNELS.LISTS_SAVE_USER_LIST, async (_event, list: XListInfo) => {
    Config.saveUserList(list);
    return { success: true, lists: Config.getUserLists() };
  });

  ipcMain.handle(IPC_CHANNELS.LISTS_FETCH_ONLINE, async () => {
    const client = new XClient();
    return await client.fetchUserLists();
  });

  // 6. Window Controls
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    win?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    win?.close();
  });

  // 7. Shell & Native OS Integration
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: '链接格式无效，仅支持 http/https 协议' };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, async (_event, itemPath: string) => {
    try {
      let target = itemPath;
      if (!path.isAbsolute(target)) {
        target = path.resolve(Config.PROJECT_ROOT, target);
      }
      if (fs.existsSync(target)) {
        shell.showItemInFolder(target);
        return { success: true, path: target };
      }
      // If direct item doesn't exist, check parent dir
      const parentDir = path.dirname(target);
      if (fs.existsSync(parentDir)) {
        await shell.openPath(parentDir);
        return { success: true, path: parentDir };
      }
      return { success: false, error: `路径不存在: ${target}` };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_event, dirPath: string) => {
    try {
      let target = dirPath;
      if (!path.isAbsolute(target)) {
        target = path.resolve(Config.PROJECT_ROOT, target);
      }
      if (fs.existsSync(target)) {
        await shell.openPath(target);
        return { success: true, path: target };
      }
      return { success: false, error: `目录不存在: ${target}` };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });
}
