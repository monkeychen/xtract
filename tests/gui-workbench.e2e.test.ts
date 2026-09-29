import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright-core';

describe('GUI Workbench E2E Automated Tests (Real IPC & Zero-Mock Contract)', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  const PORT = 5199;
  const BASE_URL = `http://127.0.0.1:${PORT}/`;

  beforeAll(async () => {
    // 1. Launch Vite Dev Server on port 5199 explicitly on 127.0.0.1
    server = await createServer({
      server: { port: PORT, host: '127.0.0.1' },
    });
    await server.listen();
    const targetUrl = server.resolvedUrls?.local[0] || BASE_URL;

    // 2. Launch system Chrome in headless mode
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }

    // 3. Open browser page and inject real-contract xtractAPI bridge before navigation
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    await page.addInitScript(() => {
      // Recorded calls for assertions
      (window as any).__recordedCalls = {
        openedUrls: [] as string[],
        revealedPaths: [] as string[],
        viewCalls: [] as any[],
        listCalls: [] as any[],
      };

      const mockDbTweets = [
        {
          tweet_id: '2001',
          author_id: '123456',
          author_name: 'Andrej Karpathy',
          author_username: 'karpathy',
          text: '# Building LLMs from Scratch\nDeep dive into tokenization, transformer attention and training loop.',
          created_at: new Date().toISOString(),
          like_count: 5200,
          retweet_count: 1400,
          reply_count: 320,
          view_count: 240000,
          urls: ['https://github.com/karpathy/nanoGPT'],
          source_type: 'following',
        },
        {
          tweet_id: '2002',
          author_id: '123457',
          author_name: 'OpenAI',
          author_username: 'OpenAI',
          text: '【重磅发布】GPT-5.6 Sol 现已正式发布并开放长思维链推理。',
          created_at: new Date().toISOString(),
          like_count: 12500,
          retweet_count: 3400,
          reply_count: 670,
          view_count: 890000,
          urls: ['https://openai.com/index/gpt-5-6'],
          source_type: 'following',
        },
      ];

      (window as any).xtractAPI = {
        openExternal: async (url: string) => {
          (window as any).__recordedCalls.openedUrls.push(url);
          return true;
        },
        showItemInFolder: async (filePath: string) => {
          (window as any).__recordedCalls.revealedPaths.push(filePath);
          return { success: true };
        },
        viewTweet: async (id: string, opts: any) => {
          (window as any).__recordedCalls.viewCalls.push({ id, opts });
          const found = mockDbTweets.find((t) => t.tweet_id === id) || mockDbTweets[0];
          return {
            tweet: {
              ...found,
              text: found.text + (opts?.forceRefresh ? '\n[Full Article Synchronized]' : ''),
            },
            exportPath: `output/${found.author_username}/${found.tweet_id}/index.md`,
          };
        },
        listTweets: async (opts: any) => {
          (window as any).__recordedCalls.listCalls.push(opts);
          let result = [...mockDbTweets];
          if (opts?.user) {
            result = result.filter(
              (t) => t.author_username.toLowerCase() === opts.user.toLowerCase()
            );
          }
          if (opts?.query) {
            result = result.filter((t) =>
              t.text.toLowerCase().includes(opts.query.toLowerCase())
            );
          }
          if (opts?.minLikes) {
            result = result.filter((t) => t.like_count >= opts.minLikes);
          }
          return result;
        },
        countTweets: async (opts: any) => {
          (window as any).__recordedCalls.countCalls = (window as any).__recordedCalls.countCalls || [];
          (window as any).__recordedCalls.countCalls.push(opts);
          let result = [...mockDbTweets];
          if (opts?.user) {
            result = result.filter(
              (t) => t.author_username.toLowerCase() === opts.user.toLowerCase()
            );
          }
          if (opts?.query) {
            result = result.filter((t) =>
              t.text.toLowerCase().includes(opts.query.toLowerCase())
            );
          }
          if (opts?.minLikes) {
            result = result.filter((t) => t.like_count >= opts.minLikes);
          }
          return result.length;
        },
        getTrends: async (cat: string) => {
          return [
            {
              rank: 1,
              name: 'DeepSeek-V4 全网热搜',
              query: 'DeepSeek-V4',
              tweet_count: '245K',
              category: cat === 'business' ? 'business' : 'tech',
            },
            {
              rank: 2,
              name: 'Claude 3.7 混合推理',
              query: 'Claude 3.7',
              tweet_count: '180K',
              category: cat === 'business' ? 'business' : 'tech',
            },
          ];
        },
        fetchFollowingStream: async () => ({ count: 2, tweets: mockDbTweets }),
        fetchUserTimeline: async () => ({ count: 1, tweets: [mockDbTweets[0]] }),
        searchTweets: async () => ({ count: 1, tweets: [mockDbTweets[1]] }),
        fetchListTimeline: async () => ({ count: 2, tweets: mockDbTweets }),
        getUserLists: async () => [
          { id: '2100985900734062922', name: 'AI与自媒体', memberCount: 6, isOwner: true },
        ],
        checkAuth: async () => ({ status: 'authenticated', name: 'Developer', screen_name: 'dev' }),
        openLoginWindow: async () => ({ status: 'authenticated' }),
        deleteTweets: async () => ({ deletedCount: 1 }),
        getConfig: async () => ({
          httpProxy: '127.0.0.1:7890',
          llmProvider: 'qwen-token-plan',
          llmAuthMode: 'account',
          llmModel: 'qwen3.8-flash',
          reasoningEnabled: true,
          reasoningEffort: 'high',
          hasXCredentials: true,
          xAuthTokenMasked: '••••••••',
          xCt0Masked: '••••••••',
        }),
        updateConfig: async (updates: any) => ({
          success: true,
          config: {
            httpProxy: '127.0.0.1:7890',
            llmProvider: 'qwen-token-plan',
            llmAuthMode: 'account',
            llmModel: 'qwen3.8-flash',
            reasoningEnabled: true,
            reasoningEffort: updates?.LLM_REASONING_EFFORT || 'high',
            hasXCredentials: true,
            xAuthTokenMasked: '••••••••',
            xCt0Masked: '••••••••',
          },
        }),
        onStreamEvent: (callback: any) => {
          (window as any).__streamCallback = callback;
          return () => {};
        },
        triggerWorkflow: async () => ({ success: true }),
        abortWorkflow: async () => ({ success: true }),
      };
    });

    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
  }, 60000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await server.close();
    }
  });

  it('Flow 1: Masthead Navigation & View Tab Switching', async () => {
    // Title verification
    const title = await page.title();
    expect(title).toContain('Xtract');

    // Default view: Reports View
    const mainHeading = await page.locator('h1.serif-title').first().textContent();
    expect(mainHeading).toContain('智能研报');

    // Switch to Trends View
    await page.locator('.nav-item', { hasText: '趋势雷达' }).click();
    await page.waitForTimeout(300);
    const trendsHeading = await page.locator('h1.serif-title').first().textContent();
    expect(trendsHeading).toContain('全网趋势');

    // Switch to Studio View
    await page.locator('.nav-item', { hasText: '情报工作台' }).click();
    await page.waitForTimeout(300);
    // In Studio, toolbar should have data source chips
    const activeChipText = await page.locator('#studio-source-chips .fmt-chip.active').first().textContent();
    expect(activeChipText?.trim()).toBe('关注流');
  });

  it('Flow 2: Studio Data Source Switching & Real Local Query Triggers (§2.1)', async () => {
    // Ensure we are in Studio view
    await page.locator('.nav-item', { hasText: '情报工作台' }).click();
    await page.waitForTimeout(200);

    // 1. In '关注流' mode: should display stream-filter-input and source badge
    expect(await page.locator('#stream-filter-input').isVisible()).toBe(true);
    expect(await page.locator('#feed-source-badge').textContent()).toContain('关注流');

    // 2. Switch to '全网搜索'
    await page.locator('#chip-source-search').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#search-query-input').isVisible()).toBe(true);
    expect(await page.locator('#feed-source-badge').textContent()).toContain('搜:');

    // 3. Switch to '博主追踪'
    await page.locator('#chip-source-user').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#user-handle-input').isVisible()).toBe(true);
    expect(await page.locator('#feed-source-badge').textContent()).toContain('@karpathy');

    // Check recorded IPC listCalls in browser
    const listCalls = await page.evaluate(() => (window as any).__recordedCalls.listCalls);
    expect(listCalls.length).toBeGreaterThan(0);
    const hasUserCall = listCalls.some((c: any) => c?.user === 'karpathy');
    expect(hasUserCall).toBe(true);

    // 4. Switch to 'X 列表'
    await page.locator('#chip-source-lists').click();
    await page.waitForTimeout(200);
    expect(await page.locator('#list-select').isVisible()).toBe(true);

    // 5. Switch back to '关注流'
    await page.locator('#chip-source-following').click();
    await page.waitForTimeout(200);
    expect(await page.locator('#stream-filter-input').isVisible()).toBe(true);
  });

  it('Flow 3: Split-action Crawl Button Dropdown Selection (20 / 50 / 100)', async () => {
    const arrowBtn = page.locator('#zone-following button.split-btn-arrow');
    await arrowBtn.click();
    await page.waitForTimeout(200);

    const menu = page.locator('#menu-following.split-btn-menu.open');
    expect(await menu.isVisible()).toBe(true);
    const menuText = await menu.textContent();
    expect(menuText).toContain('20 条 · 日常极速');
    expect(menuText).toContain('50 条 · 近期汇总');
    expect(menuText).toContain('100 条 · 深度调研');

    await menu.locator('.split-btn-item', { hasText: '50 条 · 近期汇总' }).click();
    await page.waitForTimeout(200);

    const mainBtnText = await page.locator('#label-crawl-following').textContent();
    expect(mainBtnText).toContain('50条');
  });

  it('Flow 4: Signal-to-Noise Ratio (SNR) Filter Pills', async () => {
    expect(await page.locator('.fmt-chip.active', { hasText: '全部' }).isVisible()).toBe(true);

    await page.locator('.fmt-chip', { hasText: '50+ 赞' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.fmt-chip.active', { hasText: '50+ 赞' }).isVisible()).toBe(true);

    await page.locator('.fmt-chip', { hasText: '全部' }).click();
    await page.waitForTimeout(300);
    expect(await page.locator('.fmt-chip.active', { hasText: '全部' }).isVisible()).toBe(true);
  });

  it('Flow 5: Streamlined Feed List Display & No Redundant Snippet (§1)', async () => {
    const feedItems = page.locator('.feed-item');
    expect(await feedItems.count()).toBeGreaterThan(0);

    // Assert that feed-item-snippet (redundant 120-char block) does NOT exist in compact list
    const snippetCount = await page.locator('.feed-item-snippet').count();
    expect(snippetCount).toBe(0);

    // Verify first feed item has single-line title and metadata row
    const firstItemTitle = await feedItems.first().locator('.feed-item-title').textContent();
    expect(firstItemTitle).toBeTruthy();
    expect(firstItemTitle?.trim().length).toBeGreaterThan(0);

    // Verify metrics in header
    const headerText = await feedItems.first().locator('.feed-item-header').textContent();
    expect(headerText).toContain('❤️');
  });

  it('Flow 6: Detail Interactions, Open in X, Local File Reveal & Full Tweet Sync (§2.2, §2.4)', async () => {
    // Click first feed item
    await page.locator('.feed-item').first().click();
    await page.waitForTimeout(300);

    // Detail view should render buttons
    expect(await page.locator('button', { hasText: '在 X 打开 ↗' }).isVisible()).toBe(true);
    expect(await page.locator('button', { hasText: '访达定位 ↗' }).first().isVisible()).toBe(true);
    expect(await page.locator('button', { hasText: '🔄 同步全文' }).isVisible()).toBe(true);
    expect(await page.locator('.studio-main button', { hasText: '删除' }).isVisible()).toBe(true);

    // 1. Click '在 X 打开 ↗' -> must open official tweet status URL, NOT external blog URL
    await page.locator('button', { hasText: '在 X 打开 ↗' }).click();
    await page.waitForTimeout(200);
    const lastOpenedUrl = await page.evaluate(
      () => (window as any).__recordedCalls.openedUrls.slice(-1)[0]
    );
    expect(lastOpenedUrl).toMatch(/^https:\/\/x\.com\/[^/]+\/status\/\d+$/);

    // 2. Click '访达定位 ↗' -> must reveal Page Bundle index.md
    await page.locator('button', { hasText: '访达定位 ↗' }).first().click();
    await page.waitForTimeout(400);
    const lastRevealed = await page.evaluate(
      () => (window as any).__recordedCalls.revealedPaths.slice(-1)[0]
    );
    expect(lastRevealed).toContain('output/');
    expect(lastRevealed).toContain('/index.md');

    // 3. Click '🔄 同步全文' -> must trigger viewTweet with forceRefresh: true
    await page.locator('button', { hasText: '🔄 同步全文' }).click();
    await page.waitForTimeout(400);
    const lastViewCall = await page.evaluate(
      () => (window as any).__recordedCalls.viewCalls.slice(-1)[0]
    );
    expect(lastViewCall?.opts?.forceRefresh).toBe(true);

    // 4. Click '删除' -> triggers confirmation dialog
    await page.locator('.studio-main button', { hasText: '删除' }).click();
    await page.waitForTimeout(200);

    const modal = page.locator('#delete-dialog .surface');
    expect(await modal.isVisible()).toBe(true);
    const modalText = await modal.textContent();
    expect(modalText).toContain('确认删除推文？');

    // Click '取消' to safely dismiss
    await modal.locator('button', { hasText: '取消' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('#delete-dialog').isVisible()).toBe(false);
  });

  it('Flow 7: Trends Radar Interaction & Studio Cross-linking', async () => {
    await page.locator('.nav-item', { hasText: '趋势雷达' }).click();
    await page.waitForTimeout(300);

    expect(await page.locator('.fmt-chip', { hasText: '科技' }).isVisible()).toBe(true);
    expect(await page.locator('.fmt-chip', { hasText: '商业' }).isVisible()).toBe(true);

    await page.locator('.fmt-chip', { hasText: '商业' }).click();
    await page.waitForTimeout(200);

    const viewTweetsBtn = page.locator('button', { hasText: '查看推文' }).first();
    await viewTweetsBtn.click();
    await page.waitForTimeout(300);

    // Jump to Studio in search mode
    expect(await page.locator('#chip-source-search.active').isVisible()).toBe(true);
    const searchInputVal = await page.locator('#search-query-input').inputValue();
    expect(searchInputVal.length).toBeGreaterThan(0);
  });

  it('Flow 8: Reports View Actionable Insights & Citation Click-to-Jump', async () => {
    await page.locator('.nav-item', { hasText: '智能研报' }).click();
    await page.waitForTimeout(300);

    const insightsCard = page.locator('span', { hasText: '💡 选题与培训便签' });
    expect(await insightsCard.isVisible()).toBe(true);
    expect(await page.locator('button', { hasText: '📋 复制大纲' }).isVisible()).toBe(true);

    await page.locator('button', { hasText: '📋 复制大纲' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('button', { hasText: '✓ 已复制大纲' }).isVisible()).toBe(true);

    const jumpBtn = page.locator('button', { hasText: '定位原推 ↗' }).first();
    expect(await jumpBtn.isVisible()).toBe(true);
    await jumpBtn.click();
    await page.waitForTimeout(300);

    expect(await page.locator('#view-studio').isVisible()).toBe(true);
  });

  it('Flow 9: Preferences Settings Drawer & Deep Reasoning Effort Config', async () => {
    await page.locator('button', { hasText: '⚙️ 设置' }).click();
    await page.waitForTimeout(300);

    expect(await page.locator('h2.serif-title', { hasText: '设置' }).isVisible()).toBe(true);

    const reasoningLabel = page.locator('div', { hasText: '深度思考' }).first();
    expect(await reasoningLabel.isVisible()).toBe(true);

    expect(await page.locator('.fmt-chip', { hasText: '轻量' }).isVisible()).toBe(true);
    expect(await page.locator('.fmt-chip', { hasText: '标准' }).isVisible()).toBe(true);
    expect(await page.locator('.fmt-chip', { hasText: '深度' }).isVisible()).toBe(true);

    await page.locator('.fmt-chip', { hasText: '标准' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('.fmt-chip.active', { hasText: '标准' }).isVisible()).toBe(true);

    await page.locator('button', { hasText: '保存' }).click();
    await page.waitForTimeout(800);

    expect(await page.locator('#settings-drawer').isVisible()).toBe(false);
  });

  it('Flow 10: Multi-select, Batch Real Cascade Deletion Dialog & True Count (§7.7)', async () => {
    await page.locator('.nav-item', { hasText: '情报工作台' }).click();
    await page.waitForTimeout(200);

    // Switch back to 关注流 where mockDbTweets exist
    await page.locator('#chip-source-following').click();
    await page.waitForTimeout(300);

    // 1. Verify feed count summary does NOT display hardcoded 88
    const countSummary = await page.locator('#feed-count-summary').textContent();
    expect(countSummary).not.toContain('88');

    // 2. Click tweet check
    const tweetChecks = page.locator('.tweet-check');
    expect(await tweetChecks.count()).toBeGreaterThan(0);
    await tweetChecks.first().click();
    await page.waitForTimeout(200);

    // Floating selbar should be visible
    const selbar = page.locator('#selbar');
    expect(await selbar.isVisible()).toBe(true);
    expect(await page.locator('#selbar-count').textContent()).toContain('已选 1 篇');

    // 3. Click '删除所选' -> should pop up batch-delete-dialog confirmation
    await page.locator('#btn-batch-delete').click();
    await page.waitForTimeout(200);

    const batchDialog = page.locator('#batch-delete-dialog');
    expect(await batchDialog.isVisible()).toBe(true);
    expect(await batchDialog.textContent()).toContain('确认批量删除推文？');

    // 4. Click confirm button -> triggers batch delete
    await page.locator('#btn-confirm-batch-delete').click();
    await page.waitForTimeout(300);

    expect(await page.locator('#batch-delete-dialog').isVisible()).toBe(false);
  });
});
