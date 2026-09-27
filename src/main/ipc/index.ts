import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../preload/channels.js';
import type { StreamEvent, AppConfigView } from '../../preload/index.js';
import { Config } from '../config.js';
import { Storage } from '../storage/index.js';
import { XClient } from '../client/index.js';
import { Pipeline } from '../pipeline/index.js';
import type { Tweet, DeleteFilter, DeleteResult } from '../types.js';

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
        info: `${auth.name} (@${auth.screen_name})`,
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
    async (_event, args?: { category?: string; top?: number }) => {
      const client = new XClient();
      return await client.fetchExploreTrends({
        category: args?.category || 'tech',
        top: args?.top || 10,
      });
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
      options?: { limit?: number; minLikes?: number; minRetweets?: number; user?: string }
    ): Promise<Tweet[]> => {
      if (options?.user) {
        return storage.getTweetsByUser(options.user, {
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

  // 5. Window Controls
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
}
