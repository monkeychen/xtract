import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../src/preload/channels.js';
import { xtractApiImplementation } from '../src/preload/index.js';
import { registerIpcHandlers, _resetRegisteredForTest } from '../src/main/ipc/index.js';

// Mock electron
const mockHandlers = new Map<string, Function>();
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
      handle: vi.fn((channel: string, handler: Function) => {
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
    },
    app: {
      whenReady: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn(),
      on: vi.fn(),
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
    expect(typeof api.login).toBe('function');

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
    expect(mockHandlers.has(IPC_CHANNELS.AUTH_LOGIN)).toBe(true);
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
    expect(['low', 'medium', 'high']).toContain(config.reasoningEffort);
  });

  it('Preload updateConfig should update reasoning settings and return updated config', async () => {
    registerIpcHandlers();

    const res = await xtractApiImplementation.updateConfig({
      LLM_REASONING_ENABLED: 'false',
      LLM_REASONING_EFFORT: 'low',
    });
    expect(res.success).toBe(true);
    expect(res.config.reasoningEnabled).toBe(false);
    expect(res.config.reasoningEffort).toBe('low');

    // Restore default
    await xtractApiImplementation.updateConfig({
      LLM_REASONING_ENABLED: 'true',
      LLM_REASONING_EFFORT: 'high',
    });
  });

  it('Preload onStreamEvent should register and unregister IPC listener', () => {
    const mockCallback = vi.fn();
    const unsubscribe = xtractApiImplementation.onStreamEvent(mockCallback);

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
