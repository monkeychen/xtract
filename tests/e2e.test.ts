import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { Storage } from '../src/main/storage/index.js';

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const entry = path.resolve('src/main/index.ts');
    // Windows 上 pnpm 是 .cmd 脚本，execFile 直接调用会被拒（Node 禁止无 shell 执行 .cmd），
    // 必须经 cmd /c 中转；POSIX 平台保持原样
    const isWin = process.platform === 'win32';
    execFile(
      isWin ? 'cmd' : 'pnpm',
      isWin ? ['/c', 'pnpm', 'exec', 'tsx', entry, '--', ...args] : ['exec', 'tsx', entry, '--', ...args],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error?.code ? Number(error.code) : 0,
        });
      }
    );
  });
}

describe('End-to-End (E2E) CLI & Pipeline Integration', () => {
  beforeAll(() => {
    const storage = new Storage();
    storage.saveTweets([
      {
        tweet_id: '2100170356271255650',
        text: 'Claude 3.7 Sonnet hybrid reasoning architecture released today.',
        author_id: '123456',
        author_name: 'AI Insider',
        author_username: 'ai_insider',
        created_at: new Date().toISOString(),
        like_count: 500,
        retweet_count: 100,
        reply_count: 50,
        has_rich_content: 1,
      } as any,
    ]);
    storage.close();
  });
  it('E2E: --version and -v both print the app version (exit 0)', async () => {
    const { version } = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    // 回归背景：-v 曾未定义别名报 unknown option（commander 默认只给 -V）
    for (const flag of ['--version', '-v']) {
      const res = await runCli([flag]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain(version);
    }
  });

  it('E2E: --help prints all crawl & LLM flags', async () => {
    const { stdout, exitCode } = await runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--trends');
    expect(stdout).toContain('--trends-digest');
    expect(stdout).toContain('--search');
    expect(stdout).toContain('--user');
    expect(stdout).toContain('--x-list');
    expect(stdout).toContain('--fetch-only');
    expect(stdout).toContain('--report-only');
    expect(stdout).toContain('--json');
    expect(stdout).toContain('--min-likes');
    expect(stdout).toContain('--min-retweets');
    expect(stdout).toContain('--provider');
  }, 15000);

  it('E2E: --list --json returns pure valid JSON array from SQLite', async () => {
    const { stdout, exitCode } = await runCli(['--list', '2', '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty('tweet_id');
      expect(parsed[0]).toHaveProperty('author_name');
      expect(parsed[0]).toHaveProperty('text');
    }
  }, 15000);

  it('E2E: --view <id> --json returns structured JSON and exports Markdown', async () => {
    const { stdout, exitCode } = await runCli(['--view', '2100170356271255650', '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toHaveProperty('tweet');
    expect(parsed.tweet.tweet_id).toBe('2100170356271255650');
    expect(parsed).toHaveProperty('exportedMarkdown');
    if (parsed.exportedMarkdown) {
      expect(fs.existsSync(parsed.exportedMarkdown)).toBe(true);
    }
  }, 30000);

  it('E2E: --export --json exports markdown document and returns json confirmation', async () => {
    const { stdout, exitCode } = await runCli(['--export', '3', '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.status).toBe('ok');
    expect(parsed).toHaveProperty('file');
    expect(fs.existsSync(parsed.file)).toBe(true);
  }, 15000);

  it('E2E: --check-auth handles authentication check gracefully', async () => {
    // When no auth token or in headless check, it provides clear structured response or exit
    const { stdout, stderr } = await runCli(['--check-auth', '--json']);
    // Either valid session or structured error
    if (stdout.trim()) {
      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveProperty('status');
    } else {
      expect(stderr).toContain('认证');
    }
  }, 30000);

  it('E2E: --delete without filter aborts with safety error', async () => {
    const { stderr, exitCode } = await runCli(['--delete']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('至少一个筛选条件');
  }, 15000);

  it('E2E: --delete --user <name> --dry-run --json returns dryRun preview', async () => {
    const { stdout, exitCode } = await runCli([
      '--delete',
      '--user',
      'non_existent_author',
      '--dry-run',
      '--json',
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toHaveProperty('matchedCount', 0);
  }, 15000);
});

