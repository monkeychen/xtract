import fs from 'node:fs';
import path from 'node:path';
import { ipcMain, BrowserWindow, shell, dialog, app } from 'electron';
import { IPC_CHANNELS } from '../../preload/channels.js';
import type { StreamEvent, AppConfigView } from '../../preload/index.js';
import { Config } from '../config.js';
import { Storage } from '../storage/index.js';
import { XClient } from '../client/index.js';
import { importXCredentialsFromBrowser } from '../auth/index.js';
import { createCliShortcut, runPowerShellForReal } from '../cli/shortcut.js';
import os from 'node:os';
import type { BrowserImportResult } from '../../preload/index.js';
import { Pipeline } from '../pipeline/index.js';
import { isTweetContentIncomplete } from '../client/parser.js';
import type { Tweet, DeleteFilter, DeleteResult, XListInfo, TweetQueryOptions } from '../types.js';

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

  let storage = new Storage();
  let pipeline = new Pipeline(storage);

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

  // 从用户日常浏览器读取既有 X 登录态（macOS 专用）
  // 设计约束：不执行任何自动化登录，只读取用户在真实浏览器中已建立的会话。
  ipcMain.handle(IPC_CHANNELS.AUTH_IMPORT_FROM_BROWSER, async (): Promise<BrowserImportResult> => {
    try {
      return await importXCredentialsFromBrowser();
    } catch (err: any) {
      return { success: false, message: `导入登录态时发生意外错误：${err?.message || String(err)}` };
    }
  });

  // 在 ~/bin 创建 xtract 命令入口（macOS 符号链接 / Windows .cmd shim）。
  // 仅安装版可用：开发态 execPath 指向 electron 二进制，链接无意义。
  ipcMain.handle(IPC_CHANNELS.CLI_CREATE_SHORTCUT, async () => {
    return createCliShortcut({
      platform: process.platform,
      execPath: process.execPath,
      homeDir: os.homedir(),
      isPackaged: app.isPackaged,
      shell: process.env.SHELL || '',
      runPowerShell: runPowerShellForReal,
    });
  });

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
      onlyLongTweets: Config.FETCH_ONLY_LONG_TWEETS,
      fetchAuthorReplies: Config.FETCH_AUTHOR_REPLIES,
      storageRoot: Config.STORAGE_ROOT,
      dataDir: Config.DATA_DIR,
      articlesDir: Config.ARTICLES_DIR,
      reportsDir: Config.REPORTS_DIR,
      configEnvPath: Config.CONFIG_ENV_PATH,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.CONFIG_UPDATE,
    async (_event, updates: Record<string, string>) => {
      for (const [key, value] of Object.entries(updates)) {
        process.env[key] = value;
      }

      if (updates.XTRACT_STORAGE_ROOT !== undefined) {
        const customRoot = updates.XTRACT_STORAGE_ROOT.trim();
        if (customRoot) {
          process.env.XTRACT_STORAGE_ROOT = customRoot;
        } else {
          delete process.env.XTRACT_STORAGE_ROOT;
        }
      }

      // 确保目录结构存在并持久化写入 <storageRoot>/config.env
      Config.ensureDirectories();
      Config.savePersistentConfig(updates);

      if (updates.XTRACT_STORAGE_ROOT !== undefined) {
        storage = new Storage();
        pipeline = new Pipeline(storage);
      }

      if (updates.X_AUTH_TOKEN !== undefined || updates.X_CT0 !== undefined) {
        if (fs.existsSync(Config.AUTH_STATE_PATH)) {
          try {
            fs.unlinkSync(Config.AUTH_STATE_PATH);
          } catch {
            // ignore
          }
        }
        try {
          const client = new XClient();
          const user = await client.verifyAuth({ forceBrowser: false });
          if (user) {
            Config.setCachedUser(user);
          }
        } catch {
          // ignore
        }
      }

      if (updates.HTTP_PROXY !== undefined) {
        try {
          const { session } = await import('electron');
          if (session?.defaultSession) {
            await session.defaultSession.setProxy({
              proxyRules: updates.HTTP_PROXY.trim(),
            });
          }
        } catch {
          // ignore in tests or non-gui mode
        }
      }

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
          onlyLongTweets: Config.FETCH_ONLY_LONG_TWEETS,
          fetchAuthorReplies: Config.FETCH_AUTHOR_REPLIES,
          storageRoot: Config.STORAGE_ROOT,
          dataDir: Config.DATA_DIR,
          articlesDir: Config.ARTICLES_DIR,
          reportsDir: Config.REPORTS_DIR,
          configEnvPath: Config.CONFIG_ENV_PATH,
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
        // Cache miss: return empty list immediately without hitting network/launching browser
        const emptyList: any = [];
        emptyList.updatedAt = null;
        emptyList.fromCache = true;
        return emptyList;
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
    async (event, options?: { pages?: number; limit?: number }) => {
      const taskId = `following_${Date.now()}`;
      const sendEv = (stage: string, text: string, progress: number) => {
        const streamEv: StreamEvent = {
          taskId,
          stage: stage as any,
          type: 'status',
          text,
          progress,
        };
        try {
          event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
        } catch {}
      };

      sendEv('fetch', '🌐 正在启动真实 Chrome 浏览器并建立安全会话...', 20);
      try {
        sendEv('fetch', '⏳ 正在从 X (关注流) 拦截推文数据包...', 45);
        const [fetched, inserted, skipped] = await pipeline.fetchAndStore({
          maxPages: options?.pages,
          limit: options?.limit,
        });
        sendEv('done', `✓ 抓取完成：获取 ${fetched} 条推文，新增入库 ${inserted} 条，跳过去重 ${skipped} 条`, 100);
        return { fetched, inserted, skipped };
      } catch (err: any) {
        sendEv('error', `❌ 抓取失败: ${err?.message || String(err)}`, 100);
        throw err;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_FETCH_USER,
    async (event, args: { username: string; limit?: number }) => {
      const cleanUser = args.username.replace(/^@/, '').trim();
      const taskId = `user_${Date.now()}`;
      const sendEv = (stage: string, text: string, progress: number) => {
        const streamEv: StreamEvent = {
          taskId,
          stage: stage as any,
          type: 'status',
          text,
          progress,
        };
        try {
          event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
        } catch {}
      };

      sendEv('fetch', `🌐 正在启动双轨机制检索博主 @${cleanUser} 推文流...`, 20);
      try {
        sendEv('fetch', `⏳ 正在通过实时搜索流与主页双轨拦截 @${cleanUser} 的最新推文...`, 50);
        const result = await pipeline.fetchUserAndStore(cleanUser, args.limit);
        sendEv(
          'done',
          `✓ 抓取完成：拉取 ${result.fetched} 条 @${cleanUser} 的推文，新增入库 ${result.inserted} 条，跳过重复 ${result.skipped} 条`,
          100
        );
        return { tweets: result.tweets, fetched: result.fetched, inserted: result.inserted, skipped: result.skipped };
      } catch (err: any) {
        sendEv('error', `❌ 抓取失败: ${err?.message || String(err)}`, 100);
        throw err;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_FETCH_LIST,
    async (event, args: { listId: string; limit?: number }) => {
      const taskId = `list_${Date.now()}`;
      const sendEv = (stage: string, text: string, progress: number) => {
        const streamEv: StreamEvent = {
          taskId,
          stage: stage as any,
          type: 'status',
          text,
          progress,
        };
        try {
          event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
        } catch {}
      };

      sendEv('fetch', `🌐 正在打开 X 列表并挂载网络流嗅探器...`, 25);
      try {
        sendEv('fetch', `⏳ 正在拦截列表最新推文并同步本地元数据...`, 55);
        const result = await pipeline.fetchListAndStore(args.listId, args.limit);
        sendEv(
          'done',
          `✓ 抓取完成：拉取 ${result.fetched} 条列表推文，新增入库 ${result.inserted} 条，跳过重复 ${result.skipped} 条`,
          100
        );
        return { tweets: result.tweets, fetched: result.fetched, inserted: result.inserted, skipped: result.skipped };
      } catch (err: any) {
        sendEv('error', `❌ 抓取失败: ${err?.message || String(err)}`, 100);
        throw err;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_SEARCH,
    async (
      event,
      args: {
        query: string;
        searchType?: 'live' | 'top';
        limit?: number;
        minLikes?: number;
        minRetweets?: number;
      }
    ) => {
      const taskId = `search_${Date.now()}`;
      const sendEv = (stage: string, text: string, progress: number) => {
        const streamEv: StreamEvent = {
          taskId,
          stage: stage as any,
          type: 'status',
          text,
          progress,
        };
        try {
          event.sender.send(IPC_CHANNELS.STREAM_EVENT, streamEv);
        } catch {}
      };

      sendEv('fetch', `🌐 正在向 X 发起全网实时搜索「${args.query}」...`, 25);
      try {
        sendEv('fetch', `⏳ 正在拦截 SearchTimeline 数据包并进行互动指标过滤...`, 60);
        const result = await pipeline.fetchSearchAndStore(args.query, {
          searchType: args.searchType,
          limit: args.limit,
          minLikes: args.minLikes,
          minRetweets: args.minRetweets,
        });
        sendEv(
          'done',
          `✓ 搜索完成：拉取 ${result.fetched} 条，新增入库 ${result.inserted} 条，跳过重复 ${result.skipped} 条`,
          100
        );
        return { count: result.fetched, tweets: result.tweets, fetched: result.fetched, inserted: result.inserted, skipped: result.skipped };
      } catch (err: any) {
        sendEv('error', `❌ 搜索抓取失败: ${err?.message || String(err)}`, 100);
        throw err;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_LIST,
    async (
      _event,
      options?: TweetQueryOptions
    ): Promise<Tweet[]> => {
      return storage.queryTweets(options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_COUNT,
    async (
      _event,
      options?: TweetQueryOptions
    ): Promise<number> => {
      return storage.countTweets(options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TWEETS_VIEW,
    async (
      _event,
      args: { tweetIdOrUrl: string; exportMd?: boolean; outputPath?: string; forceRefresh?: boolean }
    ) => {
      const cleanId = args.tweetIdOrUrl.match(/\d{5,}/)?.[0] || args.tweetIdOrUrl.trim();
      let tweet = storage.getTweetById(cleanId);

      // Check if text is truncated Note Tweet or incomplete X Article, or is explicitly requested to refresh
      const isIncomplete = tweet ? isTweetContentIncomplete(tweet) : true;

      if (!tweet || isIncomplete || args.forceRefresh) {
        try {
          await pipeline.fetchTweetAndStore(cleanId);
          tweet = storage.getTweetById(cleanId);
        } catch (err: any) {
          process.stderr.write(`⚠️ 单篇推文在线同步未完全成功: ${err?.message || err}\n`);
          if (!tweet) throw err;
        }
      }

      if (!tweet) {
        throw new Error(`未找到推文【${cleanId}】`);
      }

      // Always ensure single tweet markdown package is generated so Finder reveal works 100%
      let exportPath: string | undefined;
      try {
        const { filePath } = await storage.exportSingleTweetMarkdown(cleanId, {
          outputPath: args.outputPath,
          downloadImages: true,
        });
        exportPath = filePath;
      } catch {
        // fallback to standard path
        exportPath = path.join(
          Config.ARTICLES_DIR,
          tweet.author_username || 'tweet',
          tweet.tweet_id,
          'index.md'
        );
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
        const inArticles = path.resolve(Config.ARTICLES_DIR, target);
        if (fs.existsSync(inArticles)) {
          target = inArticles;
        } else {
          const inStorage = path.resolve(Config.STORAGE_ROOT, target);
          if (fs.existsSync(inStorage)) {
            target = inStorage;
          } else {
            target = path.resolve(Config.PROJECT_ROOT, target);
          }
        }
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
        const inArticles = path.resolve(Config.ARTICLES_DIR, target);
        if (fs.existsSync(inArticles)) {
          target = inArticles;
        } else {
          const inStorage = path.resolve(Config.STORAGE_ROOT, target);
          if (fs.existsSync(inStorage)) {
            target = inStorage;
          } else {
            target = path.resolve(Config.PROJECT_ROOT, target);
          }
        }
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

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_DIRECTORY,
    async (_event, defaultPath?: string): Promise<string | null> => {
      try {
        let initialPath = defaultPath ? defaultPath.trim() : '';
        if (initialPath.startsWith('~')) {
          const os = await import('node:os');
          initialPath = path.join(os.homedir(), initialPath.slice(1));
        }
        if (!initialPath || !fs.existsSync(initialPath)) {
          initialPath = Config.STORAGE_ROOT;
        }
        const win = mainWindow || (typeof BrowserWindow?.getFocusedWindow === 'function' ? BrowserWindow.getFocusedWindow() : null);
        const opts = {
          title: '选择数据存储位置',
          defaultPath: initialPath,
          properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
        };
        const result = win
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts);

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return null;
        }
        return result.filePaths[0];
      } catch (err) {
        process.stderr.write(`⚠️ 打开目录选择弹窗失败: ${err}\n`);
        return null;
      }
    }
  );
}
