import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const entry = path.resolve('src/main/index.ts');
    execFile(
      'pnpm',
      ['exec', 'tsx', entry, '--', ...args],
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
  }, 15000);

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
  }, 15000);

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

