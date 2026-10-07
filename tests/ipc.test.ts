import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { IPC_CHANNELS } from '../src/preload/channels.js';
import { xtractApiImplementation } from '../src/preload/index.js';
import { registerIpcHandlers, _resetRegisteredForTest } from '../src/main/ipc/index.js';

// Mock electron
const mockHandlers = new Map<string, (...args: any[]) => any>();
const mockSend = vi.fn();

vi.mock('electron', () => {
  return {
    ipcRenderer: {
      invoke: vi.fn(async (channel: string, ...args: any[]) => {
        const handler = mockHandlers.get(channel);
        if (handler) {
          const fakeEvent = {
            sender: {
              send: mockSend,
            },
          };
          return await handler(fakeEvent, ...args);
        }
        return { mockInvoked: channel, args };
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        mockHandlers.set(channel, handler);
      }),
    },
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => ({
        minimize: vi.fn(),
        maximize: vi.fn(),
        unmaximize: vi.fn(),
        isMaximized: vi.fn(() => false),
        close: vi.fn(),
      })),
      getFocusedWindow: vi.fn(() => null),
    },
    app: {
      whenReady: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn(),
      on: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/Users/test/SelectedDirectory'] })),
    },
  };
});

describe('Preload & IPC Communication Bridge', () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockSend.mockClear();
    _resetRegisteredForTest();
  });

  it('IPC_CHANNELS should have unique and well-formed channel names', () => {
    const channelValues = Object.values(IPC_CHANNELS);
    const uniqueChannels = new Set(channelValues);

    expect(channelValues.length).toBeGreaterThan(10);
    expect(uniqueChannels.size).toBe(channelValues.length);

    for (const channel of channelValues) {
      expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
    }
  });

  it('Preload XtractAPI should implement all required contract methods', () => {
    const api = xtractApiImplementation;

    // Auth
    expect(typeof api.checkAuth).toBe('function');

    // Config
    expect(typeof api.getConfig).toBe('function');
    expect(typeof api.updateConfig).toBe('function');

    // Trends & Digest
    expect(typeof api.getTrends).toBe('function');
    expect(typeof api.generateTrendsDigest).toBe('function');
    expect(typeof api.generateDailyDigest).toBe('function');

    // Tweets & Search
    expect(typeof api.fetchFollowing).toBe('function');
    expect(typeof api.fetchUser).toBe('function');
    expect(typeof api.fetchList).toBe('function');
    expect(typeof api.searchTweets).toBe('function');
    expect(typeof api.listTweets).toBe('function');
    expect(typeof api.viewTweet).toBe('function');
    expect(typeof api.deleteTweets).toBe('function');
    expect(typeof api.exportTweets).toBe('function');

    // Window controls & Streaming
    expect(typeof api.minimizeWindow).toBe('function');
    expect(typeof api.maximizeWindow).toBe('function');
    expect(typeof api.closeWindow).toBe('function');
    expect(typeof api.onStreamEvent).toBe('function');
  });

  it('registerIpcHandlers should register handlers for all core channels', () => {
    registerIpcHandlers();

    // Verify key channels are registered in ipcMain
    expect(mockHandlers.has(IPC_CHANNELS.AUTH_CHECK)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.CONFIG_GET)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.CONFIG_UPDATE)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.TRENDS_FETCH)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.TRENDS_DIGEST)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.DIGEST_DAILY)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.TWEETS_LIST)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.TWEETS_DELETE)).toBe(true);
    expect(mockHandlers.has(IPC_CHANNELS.WINDOW_MINIMIZE)).toBe(true);
  });

  it('Preload getConfig should invoke CONFIG_GET channel', async () => {
    registerIpcHandlers();

    const config = await xtractApiImplementation.getConfig();
    expect(config).toBeDefined();
    expect(typeof config.llmProvider).toBe('string');
    expect(typeof config.hasXCredentials).toBe('boolean');
    expect(typeof config.reasoningEnabled).toBe('boolean');
    expect(typeof config.fetchAuthorReplies).toBe('boolean');
    expect(config.fetchAuthorReplies).toBe(false);
    expect(['low', 'medium', 'high']).toContain(config.reasoningEffort);
    expect(typeof config.storageRoot).toBe('string');
    expect(typeof config.dataDir).toBe('string');
    expect(typeof config.articlesDir).toBe('string');
    expect(typeof config.reportsDir).toBe('string');
    expect(typeof config.configEnvPath).toBe('string');
    expect(typeof config.appVersion).toBe('string');
    expect(config.appVersion).toBe('0.1.2');
    // 子目录由 path.join 生成，Windows 上是反斜杠——断言必须用同源构造而非字面斜杠模板串
    expect(config.dataDir).toBe(path.join(config.storageRoot, 'data'));
    expect(config.articlesDir).toBe(path.join(config.storageRoot, 'articles'));
    expect(config.reportsDir).toBe(path.join(config.storageRoot, 'reports'));
    expect(config.configEnvPath).toBe(path.join(config.storageRoot, 'config.env'));
  });

  it('Preload updateConfig should update reasoning, fetchAuthorReplies and storageRoot settings', async () => {
    registerIpcHandlers();

    // 用当前平台 tmpdir 动态构造，硬编码 '/tmp/...' 字面量在 Windows 会被解析到当前盘符根
    const customRoot = path.join(os.tmpdir(), 'xtract_custom_storage');

    const res = await xtractApiImplementation.updateConfig({
      LLM_REASONING_ENABLED: 'false',
      LLM_REASONING_EFFORT: 'low',
      FETCH_AUTHOR_REPLIES: 'true',
      XTRACT_STORAGE_ROOT: customRoot,
    });
    expect(res.success).toBe(true);
    expect(res.config.reasoningEnabled).toBe(false);
    expect(res.config.reasoningEffort).toBe('low');
    expect(res.config.fetchAuthorReplies).toBe(true);
    expect(res.config.storageRoot).toBe(customRoot);
    expect(res.config.dataDir).toBe(path.join(customRoot, 'data'));
    expect(res.config.articlesDir).toBe(path.join(customRoot, 'articles'));
    expect(res.config.reportsDir).toBe(path.join(customRoot, 'reports'));
    expect(res.config.configEnvPath).toBe(path.join(customRoot, 'config.env'));

    // Restore default
    await xtractApiImplementation.updateConfig({
      LLM_REASONING_ENABLED: 'true',
      LLM_REASONING_EFFORT: 'high',
      FETCH_AUTHOR_REPLIES: 'false',
      XTRACT_STORAGE_ROOT: '',
    });
  });

  it('Preload onStreamEvent should register and unregister IPC listener', () => {
    const mockCallback = vi.fn();
    const unsubscribe = xtractApiImplementation.onStreamEvent(mockCallback);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('Preload getTrends without refresh should return empty list fromCache when cache misses without hitting network', async () => {
    registerIpcHandlers();

    // Use a unique category to ensure cache miss
    const res = await xtractApiImplementation.getTrends('nonexistent_category_test', 10, false);
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
    expect(res.fromCache).toBe(true);
    expect(res.updatedAt).toBeNull();
  });

  it('Preload selectDirectory should invoke DIALOG_SELECT_DIRECTORY and return chosen path', async () => {
    registerIpcHandlers();

    const res = await xtractApiImplementation.selectDirectory('/tmp');
    expect(res).toBe('/Users/test/SelectedDirectory');
  });
});
