import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { XClient } from '../src/main/client/index.js';
import { Config } from '../src/main/config.js';

describe('Interactive Login Flow (§3.2, Clean Context & URL Redirection)', () => {
  const originalEnv = { ...process.env };
  const testRoot = path.join(os.tmpdir(), `xtract_test_login_${Date.now()}`);

  beforeEach(() => {
    process.env.XTRACT_STORAGE_ROOT = testRoot;
    Config.ensureDirectories();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('1. loginInteractive should navigate directly to https://x.com/i/flow/login using a clean context', async () => {
    const client = new XClient();

    let capturedUrl = '';
    let storageStateSaved = false;
    let contextOptionsReceived: any = null;

    const mockPage = {
      goto: vi.fn(async (url: string) => {
        capturedUrl = url;
      }),
      url: vi.fn(() => 'https://x.com/home'),
      isClosed: vi.fn(() => false),
    };

    const mockCookies = [
      { name: 'auth_token', value: '1234567890abcdef1234567890abcdef12345678', domain: '.x.com' },
      { name: 'ct0', value: 'abcdef1234567890abcdef1234567890', domain: '.x.com' },
    ];

    const mockContext = {
      newPage: vi.fn(async () => mockPage),
      addInitScript: vi.fn(async () => {}),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
      cookies: vi.fn(async () => mockCookies),
      storageState: vi.fn(async ({ path: p }: { path: string }) => {
        storageStateSaved = true;
        fs.writeFileSync(p, JSON.stringify({ cookies: mockCookies }), 'utf-8');
      }),
    };

    const mockBrowser = {
      newContext: vi.fn(async (opts: any) => {
        contextOptionsReceived = opts;
        return mockContext;
      }),
      close: vi.fn(async () => {}),
    };

    // Spy on launchBrowser
    vi.spyOn(client as any, 'launchBrowser').mockResolvedValue(mockBrowser as any);

    await client.loginInteractive(10);

    // 1. Must navigate directly to official flow URL
    expect(capturedUrl).toBe('https://x.com/i/flow/login');

    // 2. Must use clean context without carrying over old storageState
    expect(contextOptionsReceived?.storageState).toBeUndefined();

    // 3. Must save storageState to AUTH_STATE_PATH
    expect(storageStateSaved).toBe(true);
    expect(fs.existsSync(Config.AUTH_STATE_PATH)).toBe(true);

    // 4. Must save X_AUTH_TOKEN and X_CT0 to persistent config.env
    expect(process.env.X_AUTH_TOKEN).toBe('1234567890abcdef1234567890abcdef12345678');
    expect(process.env.X_CT0).toBe('abcdef1234567890abcdef1234567890');
    const savedConfig = fs.readFileSync(Config.CONFIG_ENV_PATH, 'utf-8');
    expect(savedConfig).toContain('X_AUTH_TOKEN=1234567890abcdef1234567890abcdef12345678');
    expect(savedConfig).toContain('X_CT0=abcdef1234567890abcdef1234567890');
  });

  it('2. loginInteractive should abort gracefully when user closes the login window', async () => {
    const client = new XClient();

    const mockPage = {
      goto: vi.fn(async () => {}),
      url: vi.fn(() => 'https://x.com/i/flow/login'),
      isClosed: vi.fn(() => true), // user manually closed window
    };

    const mockContext = {
      newPage: vi.fn(async () => mockPage),
      addInitScript: vi.fn(async () => {}),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
      cookies: vi.fn(async () => []),
      storageState: vi.fn(async () => {}),
    };

    const mockBrowser = {
      newContext: vi.fn(async () => mockContext),
      close: vi.fn(async () => {}),
    };

    vi.spyOn(client as any, 'launchBrowser').mockResolvedValue(mockBrowser as any);

    await expect(client.loginInteractive(5)).rejects.toThrow('用户关闭');
  });
});
