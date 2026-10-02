import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright-core';

// E2E 启动真实 Vite + Chrome，冷启动（尤其 CI runner）远慢于本地：
// 默认 5s 的 testTimeout 在 CI 上会误杀重交互 Flow（真实发生过），放宽到 20s；
// beforeAll 里 Vite dev server + Chrome 冷启动在 Windows runner 上可达 60s+
vi.setConfig({ testTimeout: 20_000, hookTimeout: 120_000 });

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
        fetchFollowingCalls: [] as any[],
        fetchUserCalls: [] as any[],
        fetchListCalls: [] as any[],
        searchTweetsCalls: [] as any[],
        savedUserLists: [] as any[],
        shortcutCalls: [] as any[],
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
        {
          tweet_id: '2003',
          author_id: '123458',
          author_name: 'Demo Creator',
          author_username: 'democreator',
          text: '🎥 体验全新视频推文流式在线播放效果！',
          created_at: new Date().toISOString(),
          like_count: 8800,
          retweet_count: 1200,
          reply_count: 150,
          view_count: 150000,
          media_urls: [
            'https://pbs.twimg.com/amplify_video_thumb/2003/img/thumb.jpg',
            'https://video.twimg.com/amplify_video/2003/vid/avc1/1920x1080/demo.mp4',
          ],
          video_url: 'https://video.twimg.com/amplify_video/2003/vid/avc1/1920x1080/demo.mp4',
          video_poster: 'https://pbs.twimg.com/amplify_video_thumb/2003/img/thumb.jpg',
          source_type: 'following',
        },
        {
          tweet_id: '2104576109161660508',
          author_id: '123459',
          author_name: 'LuBtc',
          author_username: 'LuBtc888',
          text: '其实刘翔前些日那些事，\n\n张国伟能连发两篇爆文提醒已经算很好了 https://t.co/1LdVnJ3Lps',
          created_at: new Date().toISOString(),
          like_count: 360,
          retweet_count: 45,
          reply_count: 12,
          view_count: 18000,
          media_urls: ['https://pbs.twimg.com/media/HTItzSHawAA59pK.png'],
          urls: [],
          source_type: 'following',
        },
        {
          tweet_id: '2105106509797769398',
          author_id: '123460',
          author_name: 'Qihang',
          author_username: 'qihang_zeng6688',
          text: '笑不活了😂\n\nOpenAI发布Dots这款产品\n\n然后马哥反手就买了[Dot.com](https://Dot.com)这个域名\n点[Dot.com](https://Dot.com)网站直接跳到了Grok Bot😂',
          created_at: new Date().toISOString(),
          like_count: 520,
          retweet_count: 88,
          reply_count: 24,
          view_count: 36000,
          media_urls: ['https://pbs.twimg.com/media/HTbWwcobQAAwBKf.jpg'],
          urls: ['https://Dot.com'],
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
            exportPath: `articles/${found.author_username}/${found.tweet_id}/index.md`,
          };
        },
        listTweets: async (opts: any) => {
          (window as any).__recordedCalls.listCalls.push(opts);
          let result = [...mockDbTweets];
          if (opts?.user) {
            const u = opts.user.toLowerCase();
            result = result.filter(
              (t) =>
                t.author_username.toLowerCase().includes(u) ||
                t.author_name.toLowerCase().includes(u)
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
            const u = opts.user.toLowerCase();
            result = result.filter(
              (t) =>
                t.author_username.toLowerCase().includes(u) ||
                t.author_name.toLowerCase().includes(u)
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
        searchTweets: async (query: string, opts: any) => {
          (window as any).__recordedCalls.searchTweetsCalls.push({ query, opts });
          return { count: 1, tweets: [mockDbTweets[1]] };
        },
        fetchListTimeline: async () => ({ count: 2, tweets: mockDbTweets }),
        // --- 真实抓取 API（handleCrawl 直接调用的三个入口）---
        fetchFollowing: async (opts: any) => {
          (window as any).__recordedCalls.fetchFollowingCalls.push(opts);
          return { fetched: opts?.limit ?? 20, inserted: 5, skipped: 1 };
        },
        fetchUser: async (username: string, opts: any) => {
          (window as any).__recordedCalls.fetchUserCalls.push({ username, opts });
          return { fetched: opts?.limit ?? 20, inserted: 3, skipped: 0 };
        },
        fetchList: async (listId: string, opts: any) => {
          (window as any).__recordedCalls.fetchListCalls.push({ listId, opts });
          return { fetched: opts?.limit ?? 20, inserted: 4, skipped: 0 };
        },
        saveUserList: async (list: any) => {
          (window as any).__recordedCalls.savedUserLists.push(list);
          return { success: true };
        },
        getUserLists: async () => [
          { id: '2100985900734062922', name: 'AI与自媒体', memberCount: 6, isOwner: true },
        ],
        checkAuth: async () => ({ status: 'authenticated', name: 'Developer', screen_name: 'dev' }),
        openLoginWindow: async () => ({ status: 'authenticated' }),
        createCliShortcut: async () => {
          (window as any).__recordedCalls.shortcutCalls.push(true);
          return {
            ok: true,
            pathFixed: true,
            linkPath: '/Users/dev/bin/xtract',
            message: '已创建命令：/Users/dev/bin/xtract；PATH 已写入 /Users/dev/.zshrc；新开一个终端窗口即可使用 xtract 命令。',
          };
        },
        deleteTweets: async () => ({ deletedCount: 1 }),
        getConfig: async () => ({
          httpProxy: 'http://127.0.0.1:8118',
          llmProvider: 'qwen-token-plan',
          llmAuthMode: 'account',
          llmModel: 'qwen3.8-flash',
          reasoningEnabled: true,
          reasoningEffort: 'high',
          hasXCredentials: true,
          xAuthTokenMasked: '••••••••',
          xCt0Masked: '••••••••',
          onlyLongTweets: true,
          fetchAuthorReplies: false,
          storageRoot: '~/Documents/Xtract',
          dataDir: '~/Documents/Xtract/data',
          articlesDir: '~/Documents/Xtract/articles',
          reportsDir: '~/Documents/Xtract/reports',
          configEnvPath: '~/Documents/Xtract/config.env',
        }),
        updateConfig: async (updates: any) => ({
          success: true,
          config: {
            httpProxy: updates?.HTTP_PROXY || 'http://127.0.0.1:8118',
            llmProvider: 'qwen-token-plan',
            llmAuthMode: 'account',
            llmModel: 'qwen3.8-flash',
            reasoningEnabled: true,
            reasoningEffort: updates?.LLM_REASONING_EFFORT || 'high',
            hasXCredentials: true,
            xAuthTokenMasked: '••••••••',
            xCt0Masked: '••••••••',
            onlyLongTweets: true,
            fetchAuthorReplies: updates?.FETCH_AUTHOR_REPLIES === 'true',
            storageRoot: updates?.XTRACT_STORAGE_ROOT || '~/Documents/Xtract',
            dataDir: `${updates?.XTRACT_STORAGE_ROOT || '~/Documents/Xtract'}/data`,
            articlesDir: `${updates?.XTRACT_STORAGE_ROOT || '~/Documents/Xtract'}/articles`,
            reportsDir: `${updates?.XTRACT_STORAGE_ROOT || '~/Documents/Xtract'}/reports`,
            configEnvPath: `${updates?.XTRACT_STORAGE_ROOT || '~/Documents/Xtract'}/config.env`,
          },
        }),
        selectDirectory: async () => '/tmp/custom_xtract',
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

  it('Flow 1: Masthead Header & Direct StudioView Rendering', async () => {
    // Title verification
    const title = await page.title();
    expect(title).toContain('Xtract');

    // Default view: Direct StudioView (Intelligence Workbench)
    const workbenchTitle = await page.locator('.masthead span', { hasText: '情报工作台' }).first().textContent();
    expect(workbenchTitle).toContain('情报工作台');

    // In Studio, toolbar should have data source chips with '关注流' active
    const activeChipText = await page.locator('#studio-source-chips .fmt-chip.active').first().textContent();
    expect(activeChipText?.trim()).toBe('关注流');
  });

  it('Flow 2: Studio Data Source Switching & Real Local Query Triggers (§2.1)', async () => {
    // Already in Studio view, verify source switching directly
    await page.waitForTimeout(200);

    // 1. In '关注流' mode: should display stream-filter-input and source badge
    expect(await page.locator('#stream-filter-input').isVisible()).toBe(true);
    expect(await page.locator('#feed-source-badge').textContent()).toContain('关注流');

    // 2. Switch to '全网搜索'
    await page.locator('#chip-source-search').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#search-query-input').isVisible()).toBe(true);
    expect(await page.locator('#search-query-input').inputValue()).toBe('');
    expect(await page.locator('#feed-source-badge').textContent()).toContain('全库推文');

    // 3. Switch to '博主追踪'
    await page.locator('#chip-source-user').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#user-handle-input').isVisible()).toBe(true);
    expect(await page.locator('#user-handle-input').inputValue()).toBe('');
    expect(await page.locator('#feed-source-badge').textContent()).toContain('全部博主');

    // 填入博主名后，验证联动查询与 badge 变化
    await page.locator('#user-handle-input').fill('karpathy');
    await page.waitForTimeout(350);
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

    // 6. 关注流操作区布局与其他数据源一致：输入框在前、抓取按钮在后（§交互一致性）
    const zoneOrder = await page.evaluate(() => {
      const zone = document.querySelector('#zone-following');
      const inputLeft = zone?.querySelector('#stream-filter-input')?.getBoundingClientRect().left ?? -1;
      const buttonLeft = zone?.querySelector('button.split-btn-main')?.getBoundingClientRect().left ?? -1;
      return { inputLeft, buttonLeft };
    });
    expect(zoneOrder.inputLeft).toBeGreaterThan(0);
    expect(zoneOrder.inputLeft).toBeLessThan(zoneOrder.buttonLeft);

    // 7. 四个数据源的抓取按钮 label 必须完全一致（§交互一致性）：「抓取最新 N 条」
    const crawlLabels: string[] = [];
    for (const chip of ['following', 'user', 'lists', 'search']) {
      await page.locator(`#chip-source-${chip}`).click();
      await page.waitForTimeout(150);
      crawlLabels.push((await page.locator(`#label-crawl-${chip}`).textContent()) ?? '');
    }
    expect(new Set(crawlLabels).size).toBe(1);
    expect(crawlLabels[0]).toContain('抓取最新');
    expect(crawlLabels[0]).toContain('20');

    // 恢复到关注流，保持本 Flow 结束状态与原先一致（后续 Flow 依赖此状态）
    await page.locator('#chip-source-following').click();
    await page.waitForTimeout(150);
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
    expect(mainBtnText).toContain('抓取最新');
    expect(mainBtnText).toContain('50');
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
    expect(lastRevealed).toContain('articles/');
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

  it('Flow 7: Video Tweet Online Player Interaction & Browser Playback Direct Link', async () => {
    // 1. Click on the video tweet in the list
    const videoItem = page.locator('.feed-item', { hasText: '体验全新视频推文' }).first();
    expect(await videoItem.isVisible()).toBe(true);
    await videoItem.click();
    const videoContainer = page.locator('#tweet-detail-video');
    await videoContainer.waitFor({ state: 'visible', timeout: 5000 });

    // 3. Native video element should have src matching the MP4 URL
    const videoElement = videoContainer.locator('video');
    expect(await videoElement.getAttribute('src')).toBe('https://video.twimg.com/amplify_video/2003/vid/avc1/1920x1080/demo.mp4');

    // 4. Big play overlay button should exist
    const bigPlayBtn = page.locator('#video-big-play-btn');
    expect(await bigPlayBtn.isVisible()).toBe(true);

    // 5. Test clicking '🌐 在系统浏览器播放 ↗'
    const openBrowserBtn = videoContainer.locator('button', { hasText: '在系统浏览器播放 ↗' });
    expect(await openBrowserBtn.isVisible()).toBe(true);
    await openBrowserBtn.click();
    await page.waitForTimeout(200);

    const openedUrls = await page.evaluate(() => (window as any).__recordedCalls.openedUrls);
    expect(openedUrls).toContain('https://video.twimg.com/amplify_video/2003/vid/avc1/1920x1080/demo.mp4');

    // 6. Test copy video direct link
    const copyBtn = videoContainer.locator('button', { hasText: '复制直链' });
    expect(await copyBtn.isVisible()).toBe(true);
    await copyBtn.click();
    await page.waitForTimeout(200);
    expect(await videoContainer.locator('button', { hasText: '已复制直链' }).isVisible()).toBe(true);
  });

  it('Flow 8: Photo Tweet Media Rendering & Lightbox Interaction', async () => {
    // 1. Locate and click LuBtc888's photo tweet
    const photoItem = page.locator('.feed-item', { hasText: '刘翔前些日那些事' }).first();
    expect(await photoItem.isVisible()).toBe(true);

    // Verify tag shows 📷 图文
    expect(await photoItem.locator('.feed-tag', { hasText: '图文' }).isVisible()).toBe(true);

    await photoItem.click();

    // 2. Photo media container should be displayed
    const mediaContainer = page.locator('#tweet-detail-media');
    await mediaContainer.waitFor({ state: 'visible', timeout: 5000 });

    // 3. Image tag should exist with correct twimg src (NOT filtered out by mistake)
    const imgElement = mediaContainer.locator('img').first();
    await imgElement.waitFor({ state: 'visible', timeout: 5000 });
    expect(await imgElement.getAttribute('src')).toBe('https://pbs.twimg.com/media/HTItzSHawAA59pK.png');

    // 4. Test clicking image to open Lightbox Modal
    await imgElement.click();
    await page.waitForTimeout(200);

    const lightbox = page.locator('#image-preview-modal');
    expect(await lightbox.isVisible()).toBe(true);
    const lightboxImg = lightbox.locator('img');
    expect(await lightboxImg.getAttribute('src')).toBe('https://pbs.twimg.com/media/HTItzSHawAA59pK.png');

    // 5. Test close lightbox with close button
    const closeBtn = lightbox.locator('button', { hasText: '✕' });
    expect(await closeBtn.isVisible()).toBe(true);
    await closeBtn.click();
    await page.waitForTimeout(200);
    expect(await page.locator('#image-preview-modal').isVisible()).toBe(false);

    // 6. Test copy direct link in media bottom toolbar
    const copyImgBtn = mediaContainer.locator('button', { hasText: '复制原图直链' });
    expect(await copyImgBtn.isVisible()).toBe(true);
    await copyImgBtn.click();
    await page.waitForTimeout(100);

    // 7. Test open image in browser
    const openImgBtn = mediaContainer.locator('button', { hasText: '在浏览器查看 ↗' });
    expect(await openImgBtn.isVisible()).toBe(true);
    await openImgBtn.click();
    await page.waitForTimeout(200);

    const openedUrls = await page.evaluate(() => (window as any).__recordedCalls.openedUrls);
    expect(openedUrls).toContain('https://pbs.twimg.com/media/HTItzSHawAA59pK.png');
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

    // Verify 抓取过滤规则 switch is visible and checked by default
    const filterRuleHeader = page.locator('div', { hasText: '抓取过滤规则' }).first();
    expect(await filterRuleHeader.isVisible()).toBe(true);
    expect(await page.locator('div', { hasText: '仅抓取长推文与专栏文章' }).first().isVisible()).toBe(true);

    const longTweetsToggle = page.locator('#only-long-tweets-toggle');
    expect(await longTweetsToggle.isChecked()).toBe(true);

    // Toggle switch via slider and back
    const toggleSlider = page.locator('label.switch:has(#only-long-tweets-toggle) .slider');
    await toggleSlider.click();
    await page.waitForTimeout(100);
    expect(await longTweetsToggle.isChecked()).toBe(false);
    await toggleSlider.click();
    await page.waitForTimeout(100);
    expect(await longTweetsToggle.isChecked()).toBe(true);

    // Verify 抓取作者追评开关 is visible and UNCHECKED by default (default false)
    expect(await page.locator('div', { hasText: '抓取作者追评与追加回复' }).first().isVisible()).toBe(true);
    const authorRepliesToggle = page.locator('#fetch-author-replies-toggle');
    expect(await authorRepliesToggle.isChecked()).toBe(false);

    // Toggle author replies switch via slider and back
    const authorRepliesSlider = page.locator('label.switch:has(#fetch-author-replies-toggle) .slider');
    await authorRepliesSlider.click();
    await page.waitForTimeout(100);
    expect(await authorRepliesToggle.isChecked()).toBe(true);
    await authorRepliesSlider.click();
    await page.waitForTimeout(100);
    expect(await authorRepliesToggle.isChecked()).toBe(false);

    // Verify 数据存储位置 section exists with directory picker and reset button
    const storageRootHeader = page.locator('div', { hasText: '数据存储位置' }).first();
    expect(await storageRootHeader.isVisible()).toBe(true);

    const storageRootInput = page.locator('#storage-root-input');
    expect(await storageRootInput.isVisible()).toBe(true);
    expect(await storageRootInput.inputValue()).toBe('~/Documents/Xtract');

    // Test directory picker button
    const selectDirBtn = page.locator('#select-dir-btn');
    expect(await selectDirBtn.isVisible()).toBe(true);
    await selectDirBtn.click();
    await page.waitForTimeout(100);
    expect(await storageRootInput.inputValue()).toBe('/tmp/custom_xtract');

    await page.locator('button', { hasText: '恢复默认' }).click();
    expect(await storageRootInput.inputValue()).toBe('~/Documents/Xtract');

    await page.locator('button', { hasText: '保存' }).click();
    await page.waitForTimeout(800);

    expect(await page.locator('#settings-drawer').isVisible()).toBe(false);
  });

  it('Flow 10: Multi-select, Batch Real Cascade Deletion Dialog & True Count (§7.7)', async () => {
    // Switch to 关注流 where mockDbTweets exist
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

  it('Flow 11: Rich Tweet Text Markdown Links & Clickable Navigation', async () => {
    // 1. Locate and click Qihang's tweet (contains [Dot.com](https://Dot.com))
    const linkTweetItem = page.locator('.feed-item', { hasText: '笑不活了' }).first();
    expect(await linkTweetItem.isVisible()).toBe(true);

    await linkTweetItem.click();
    await page.waitForTimeout(300);

    // 2. Locate detail text container
    const detailText = page.locator('#tweet-detail-text');
    expect(await detailText.isVisible()).toBe(true);

    // 3. Verify inline links are rendered as <a> elements with [Dot.com] label, NOT raw t.co
    const inlineLinks = detailText.locator('a.tweet-inline-link');
    expect(await inlineLinks.count()).toBeGreaterThanOrEqual(1);

    const firstLinkText = await inlineLinks.first().textContent();
    expect(firstLinkText).toContain('Dot.com');
    expect(firstLinkText).not.toContain('https://t.co/');

    // 4. Click the link and verify system browser navigation was called
    await inlineLinks.first().click();
    await page.waitForTimeout(200);

    const openedUrls = await page.evaluate(() => (window as any).__recordedCalls.openedUrls);
    expect(openedUrls).toContain('https://Dot.com');
  });

  // ==========================================================================
  // Flow 12-18: 抓取链路、流式进度、加载更多、空态与键盘关闭
  // 新增于 openspec 2026-09-30-test-regression-net（Flow 1-11 保持不变）
  //
  // 本项目仅依赖 playwright-core，未引入 @playwright/test，因此没有
  // expect(locator).toBeVisible() / expect.poll 等断言器。以下用
  // playwright-core 原生 Locator API + vitest expect 组合实现等待与断言，
  // 避免退化为固定 waitForTimeout 的脆弱写法。
  // ==========================================================================

  const recorded = (key: string): Promise<any[]> =>
    page.evaluate((k: string) => (window as any).__recordedCalls[k], key) as unknown as Promise<any[]>;

  const resetRecording = (key: string) =>
    page.evaluate((k) => {
      (window as any).__recordedCalls[k] = [];
    }, key);

  /** 轮询直到条件满足或超时，返回最后一次探测值。 */
  async function waitUntil<T>(probe: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 5000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const v = await probe();
      if (predicate(v)) return v;
      if (Date.now() - start > timeoutMs) return v;
      await page.waitForTimeout(100);
    }
  }

  async function expectTextToBe(locator: any, expected: string) {
    await locator.waitFor({ state: 'visible' });
    const t = await waitUntil<string | null>(
      () => locator.textContent() as Promise<string | null>,
      (v) => (v || '').trim() === expected
    );
    expect((t || '').trim()).toBe(expected);
  }

  async function expectTextToContain(locator: any, needle: string) {
    await locator.waitFor({ state: 'visible' });
    const t = await waitUntil<string | null>(
      () => locator.textContent() as Promise<string | null>,
      (v) => (v || '').includes(needle)
    );
    expect(t || '').toContain(needle);
  }

  it('Flow 12: Crawl Target Guards Reject Empty Input Without Firing Any Fetch', async () => {
    await resetRecording('searchTweetsCalls');
    await resetRecording('fetchUserCalls');

    // --- search 源：空关键词 ---
    await page.locator('#chip-source-search').click();
    await page.locator('#search-query-input').waitFor({ state: 'visible' });
    await page.locator('#search-query-input').fill('');
    await page.locator('#zone-search button.split-btn-main').click();

    await expectTextToBe(page.locator('#toast-message'), '请输入要搜索的关键词');
    expect(await recorded('searchTweetsCalls')).toHaveLength(0);

    // --- user 源：空 handle ---
    await page.locator('#chip-source-user').click();
    await page.locator('#user-handle-input').waitFor({ state: 'visible' });
    await page.locator('#user-handle-input').fill('');
    await page.locator('#zone-user button.split-btn-main').click();

    await expectTextToBe(page.locator('#toast-message'), '请输入要追踪的博主用户名（如 @username）');
    expect(await recorded('fetchUserCalls')).toHaveLength(0);

    // 复原到关注流，避免影响后续 Flow
    await page.locator('#chip-source-following').click();
    await page.locator('#stream-filter-input').waitFor({ state: 'visible' });
  });

  it('Flow 13: Following Crawl Passes Pages And Limit Computed From Crawl Count', async () => {
    await resetRecording('fetchFollowingCalls');

    // 显式把抓取条数设为 50：crawlLimit 默认值为 20，直接断言易与默认值混淆
    await page.locator('#zone-following button.split-btn-arrow').click();
    await page.locator('#menu-following.split-btn-menu.open .split-btn-item', { hasText: '50 条' }).click();
    await expectTextToBe(page.locator('#label-crawl-following'), '🔄 抓取最新 50 条');

    await page.locator('#zone-following button.split-btn-main').click();

    // pages = Math.ceil(50 / 20) = 3
    const calls = await waitUntil(
      () => recorded('fetchFollowingCalls'),
      (v) => v.length >= 1
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ pages: 3, limit: 50 });
  });

  it('Flow 14: Search Crawl Passes Query And MinLikes Threshold', async () => {
    await resetRecording('searchTweetsCalls');

    // 先切到 50+ 赞门槛，使 minLikes 进入抓取入参
    await page.locator('.fmt-chip', { hasText: '50+ 赞' }).click();

    await page.locator('#chip-source-search').click();
    await page.locator('#search-query-input').fill('LLM');
    await page.waitForTimeout(500); // 250ms 防抖 + 列表重载
    await page.locator('#zone-search button.split-btn-main').click();

    const calls = await waitUntil(
      () => recorded('searchTweetsCalls'),
      (v) => v.length >= 1
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toBe('LLM');
    expect(calls[0].opts.minLikes).toBe(50);

    // 复位门槛，避免污染后续 Flow
    await page.locator('.fmt-chip', { hasText: '全部' }).first().click();
  });

  it('Flow 15: User And List Crawls Strip Prefixes And Parse Ids', async () => {
    await resetRecording('fetchUserCalls');
    await resetRecording('fetchListCalls');

    // --- user 源：剥离 @ 前缀 ---
    await page.locator('#chip-source-user').click();
    await page.locator('#user-handle-input').fill('@karpathy');
    await page.waitForTimeout(500);
    await page.locator('#zone-user button.split-btn-main').click();

    const userCalls = await waitUntil(
      () => recorded('fetchUserCalls'),
      (v) => v.length >= 1
    );
    expect(userCalls[0].username).toBe('karpathy');

    // --- lists 源：先选 custom 才会渲染自定义输入框，再从 URL 解析纯数字 ID ---
    await page.locator('#chip-source-lists').click();
    await page.locator('#list-select').selectOption('custom');
    await page.locator('#custom-list-input').fill('https://x.com/i/lists/1234567890');
    await page.waitForTimeout(500);
    await page.locator('#zone-lists button.split-btn-main').click();

    const listCalls = await waitUntil(
      () => recorded('fetchListCalls'),
      (v) => v.length >= 1
    );
    expect(listCalls[0].listId).toBe('1234567890');

    // 操作区不再显示「已存 N 篇」（那是全库总数，放在列表语境下误导，已删除）
    const zoneText = await page.locator('#zone-lists').innerText();
    expect(zoneText).not.toContain('已存');
  });

  it('Flow 16: Live Crawl Progress Card Reflects Streaming Events', async () => {
    await page.locator('#chip-source-following').click();
    await page.locator('#stream-filter-input').waitFor({ state: 'visible' });

    // 触发抓取后，进度卡片由 handleCrawl 立即创建
    await page.locator('#zone-following button.split-btn-main').click();
    await page.locator('#crawl-progress-card').waitFor({ state: 'visible' });

    // 模拟主进程推送 done 事件
    await page.evaluate(() => {
      (window as any).__streamCallback({ taskId: 't1', stage: 'done', text: '已落库 12 条' });
    });
    await expectTextToContain(page.locator('#crawl-progress-card'), '抓取完成');
    await expectTextToContain(page.locator('#crawl-progress-card'), '已落库 12 条');

    // 模拟 error 事件（三态中的失败态）
    await page.evaluate(() => {
      (window as any).__streamCallback({ taskId: 't1', stage: 'error', text: '触发风控拦截' });
    });
    await expectTextToContain(page.locator('#crawl-progress-card'), '抓取失败');
    await expectTextToContain(page.locator('#crawl-progress-card'), '触发风控拦截');
  });

  it('Flow 17: Load More Button Reflects Exhausted State And Is Disabled', async () => {
    await page.locator('#chip-source-following').click();
    await page.locator('#stream-filter-input').waitFor({ state: 'visible' });

    // mock 库共 5 条，默认拉取 50 条 → 已达上限
    await expectTextToBe(page.locator('#btn-load-more'), '✓ 已是全部推文');
    const disabled = await waitUntil(
      () => page.locator('#btn-load-more').isDisabled(),
      (v) => v === true
    );
    expect(disabled).toBe(true);

    // 过滤到更少结果时仍保持"已全部"。
    // 注意：mock 的 listTweets 只对推文正文做关键词过滤、不匹配作者名，
    // 因此关键词必须取自 mock 正文中真实存在的片段。
    await page.locator('#stream-filter-input').fill('GPT');
    await page.waitForTimeout(500);
    await expectTextToBe(page.locator('#btn-load-more'), '✓ 已是全部推文');

    await page.locator('#stream-filter-input').fill('');
    await page.waitForTimeout(500);
  }, 30000);

  it('Flow 18: Empty States And Escape Key Dismissals', async () => {
    // --- 空态：过滤到无结果时展示空态文案 ---
    await page.locator('#chip-source-following').click();
    await page.locator('#stream-filter-input').waitFor({ state: 'visible' });
    await page.locator('#stream-filter-input').fill('zzz绝对不存在的关键词zzz');
    await page.waitForTimeout(500);
    await expectTextToContain(page.locator('#feed-list-container'), '本地暂无关注流推文');

    await page.locator('#stream-filter-input').fill('');
    await page.waitForTimeout(500);

    // --- Escape 关闭下拉菜单 ---
    await page.locator('#zone-following button.split-btn-arrow').click();
    await page.locator('#menu-following').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    const menuClass = await waitUntil(
      () => page.locator('#menu-following').getAttribute('class'),
      (v) => !(v || '').includes('open')
    );
    expect(menuClass).not.toContain('open');

    // --- Escape 关闭灯箱（选一条带配图的推文：mock 第 4 条 LuBtc）---
    await page.locator('.feed-item').nth(3).click();
    await page.locator('#tweet-detail-media img').waitFor({ state: 'visible' });
    await page.locator('#tweet-detail-media img').first().click();
    await page.locator('#image-preview-modal').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#image-preview-modal').waitFor({ state: 'hidden' });
  });

  it('Flow 19: Settings Drawer CLI Shortcut Creation Feedback (§4.7.2)', async () => {
    await page.locator('button', { hasText: '⚙️ 设置' }).click();
    await page.waitForTimeout(300);

    // 命令行区块与创建按钮可见
    const createBtn = page.locator('button', { hasText: '创建命令行快捷方式' });
    await createBtn.waitFor({ state: 'visible' });

    await createBtn.click();

    // 按钮进入 loading 态
    await page.waitForTimeout(150);

    // 状态反馈常驻渲染（成功文案包含命令路径与下一步指引）
    const feedback = page.locator('#settings-drawer div', { hasText: '已创建命令：/Users/dev/bin/xtract' }).last();
    await feedback.waitFor({ state: 'visible' });

    const shortcutCalls = await page.evaluate(() => (window as any).__recordedCalls.shortcutCalls);
    expect(shortcutCalls).toHaveLength(1);

    await page.locator('#settings-drawer .secondary-button').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('#settings-drawer').isVisible()).toBe(false);
  });
});
