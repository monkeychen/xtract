/**
 * README 截图生成器：启动真实 Vite + Chrome（注入与 E2E 相同结构的 mock IPC 桥），
 * 对工作台核心场景截图到 docs/assets/。UI 改版后重跑即可刷新截图。
 *
 * 用法：pnpm exec tsx scripts/capture-shots.ts
 */
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const OUT_DIR = path.join(projectRoot, 'docs/assets');
const PORT = 5199;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 内联 SVG 渐变占位图（无需外网加载，截图稳定可复现）
const MOCK_TWEETS = [
  {
    tweet_id: '2001',
    author_name: 'Andrej Karpathy',
    author_username: 'karpathy',
    text: '# LLM 系列：深度解析推理模型的思考链\n思维链的显式展开让模型在数学与代码基准上获得了跨越式提升，但推理成本也水涨船高。本文拆解三种主流的推理预算控制策略：静态配额、动态裁剪与自我验证回路，并给出在不同规模模型上的实测数据……\n\n## 1. 静态配额：简单但有效的基线\n为每次推理设定固定 token 上限，超限即强制收敛。实测在 GSM8K 上仅损失 1.2% 精度，却节省 43% 推理成本。\n\n## 2. 动态裁剪：让模型自己决定何时思考\n以置信度为信号，简单问题短路直出，复杂问题展开完整思维链……',
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    like_count: 3420,
    retweet_count: 890,
    is_article: true,
    source_type: 'following',
  },
  {
    tweet_id: '2002',
    author_name: 'Dotey',
    author_username: 'dotey',
    text: 'AI Agent 的 2026：从对话到自主执行，工作流编排正在成为新的操作系统。真正的护城河不是模型本身，而是领域数据的飞轮。',
    created_at: new Date(Date.now() - 7200 * 1000).toISOString(),
    like_count: 1250,
    retweet_count: 340,
    source_type: 'following',
  },
  {
    tweet_id: '2003',
    author_name: 'Swyx',
    author_username: 'swyx',
    text: 'The transition from pre-training heavy AI models to test-time reasoning compute is fundamentally changing developer ergonomics.',
    created_at: new Date(Date.now() - 10800 * 1000).toISOString(),
    like_count: 980,
    retweet_count: 210,
    source_type: 'following',
  },
  {
    tweet_id: '2004',
    author_name: 'Sam Altman',
    author_username: 'sama',
    text: 'excited for what comes next. the compute curves look unlike anything else in the economy.',
    created_at: new Date(Date.now() - 14400 * 1000).toISOString(),
    like_count: 8600,
    retweet_count: 1420,
    source_type: 'following',
  },
  {
    tweet_id: '2005',
    author_name: 'Gabor Celle',
    author_username: 'gaborcselle',
    text: 'A clean desktop tool with zero API keys required (access to your own data, local first) is a rare thing. Ship more of those.',
    created_at: new Date(Date.now() - 18000 * 1000).toISOString(),
    like_count: 640,
    retweet_count: 95,
    source_type: 'following',
  },
  {
    tweet_id: '2006',
    author_name: 'Lenny Rachitsky',
    author_username: 'lennysan',
    text: 'The best AI products of 2026 share one trait: they remove a step, not add a feature.',
    created_at: new Date(Date.now() - 21600 * 1000).toISOString(),
    like_count: 2100,
    retweet_count: 480,
    source_type: 'following',
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server: ViteDevServer = await createServer({
    server: { port: PORT, host: '127.0.0.1' },
  });
  await server.listen();

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 2,
  });
  const page: Page = await context.newPage();

  // mock IPC 桥：结构与 src/preload/index.ts 的 XtractAPI 对齐。
  // 必须用纯 JS 字符串而非 TS 函数：tsx/esbuild 会向转译后的函数注入 __name helper，
  // 该 helper 在浏览器 initScript 上下文不存在，会导致桥脚本 ReferenceError 静默失效
  // （页面随即落入降级演示模式，截图出现「示例数据」横幅）。
  const bridgeScript = `
    const tweets = ${JSON.stringify(MOCK_TWEETS)};
    (window).xtractAPI = {
      listTweets: async () => tweets,
      countTweets: async () => tweets.length,
      viewTweet: async (id) => {
        const found = tweets.find((t) => t.tweet_id === id) || tweets[0];
        return { tweet: found, exportPath: 'articles/' + found.author_username + '/' + found.tweet_id + '/index.md' };
      },
      fetchFollowing: async () => ({ fetched: 0, inserted: 0, skipped: 0 }),
      fetchUser: async () => ({ fetched: 0, inserted: 0, skipped: 0 }),
      fetchList: async () => ({ fetched: 0, inserted: 0, skipped: 0 }),
      searchTweets: async () => ({ fetched: 0, inserted: 0, skipped: 0 }),
      getUserLists: async () => [{ id: '2100985900734062922', name: 'AI 与自媒体', memberCount: 6, isOwner: true }],
      saveUserList: async () => ({ success: true }),
      getConfig: async () => ({
        httpProxy: 'http://127.0.0.1:8118',
        llmProvider: 'qwen-token-plan',
        llmAuthMode: 'account',
        llmModel: 'qwen3.8-flash',
        reasoningEnabled: true,
        reasoningEffort: 'high',
        hasXCredentials: true,
        fetchAuthorReplies: false,
        onlyLongTweets: true,
        storageRoot: '~/Documents/Xtract',
        dataDir: '~/Documents/Xtract/data',
        articlesDir: '~/Documents/Xtract/articles',
        reportsDir: '~/Documents/Xtract/reports',
        configEnvPath: '~/Documents/Xtract/config.env',
      }),
      updateConfig: async () => ({ success: true, config: {} }),
      checkAuth: async () => ({ isValid: true, screenName: 'dev', name: 'Developer' }),
      createCliShortcut: async () => ({ ok: true, pathFixed: true, message: '' }),
      openExternal: async () => ({ success: true }),
      showItemInFolder: async () => ({ success: true }),
      openPath: async () => ({ success: true }),
      selectDirectory: async () => null,
      onStreamEvent: () => () => {},
    };
  `;
  await page.addInitScript(bridgeScript);

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  console.log(
    'inject check:',
    await page.evaluate(() => ({
      hasApi: Boolean((window as any).xtractAPI),
      hasListTweets: typeof (window as any).xtractAPI?.listTweets,
    }))
  );
  await sleep(1200);

  // 场景 1：工作台全景（关注流 + 选中首条详情三栏）
  await page.locator('.feed-item').first().click();
  await sleep(900);
  await page.screenshot({ path: path.join(OUT_DIR, 'workbench.png') });
  console.log('✓ workbench.png');

  // 场景 2：设置抽屉（X 账号 / 命令行 / 模型服务）
  await page.locator('button', { hasText: '⚙️ 设置' }).click();
  await sleep(700);
  await page.screenshot({ path: path.join(OUT_DIR, 'settings.png') });
  console.log('✓ settings.png');

  await browser.close();
  await server.close();
  console.log(`🎉 截图完成 → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('💥', err?.message || err);
  process.exit(1);
});
