import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright-core';

describe('GUI Workbench E2E Automated Tests (Playwright + React SPA)', () => {
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

    // 3. Open browser page and navigate to root
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.goto(targetUrl);
    await page.waitForLoadState('domcontentloaded');
  }, 30000);

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
    expect(mainHeading).toContain('智能研报与深度晨报');

    // Switch to Trends View
    await page.locator('.masthead-nav-item', { hasText: '趋势雷达' }).click();
    await page.waitForTimeout(300);
    const trendsHeading = await page.locator('h1.serif-title').first().textContent();
    expect(trendsHeading).toContain('全网热点趋势雷达');

    // Switch to Studio View
    await page.locator('.masthead-nav-item', { hasText: '情报工作台' }).click();
    await page.waitForTimeout(300);
    // In Studio, toolbar should have data source chips
    const activeChipText = await page.locator('.fmt-chip.active').first().textContent();
    expect(activeChipText?.trim()).toBe('关注流');
  });

  it('Flow 2: Studio Data Source Switching & Contextual Toolbar Controls', async () => {
    // Ensure we are in Studio view
    await page.locator('.masthead-nav-item', { hasText: '情报工作台' }).click();
    await page.waitForTimeout(200);

    // 1. In '关注流' mode: should display stream-filter-input and "抓取最新"
    expect(await page.locator('input[placeholder*="过滤当前推文"]').isVisible()).toBe(true);
    expect(await page.locator('button.split-btn-main').textContent()).toContain('抓取最新');

    // 2. Switch to '全网搜索'
    await page.locator('.fmt-chip', { hasText: '全网搜索' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('input[placeholder*="输入关键词或语法"]').isVisible()).toBe(true);
    expect(await page.locator('button.split-btn-main').textContent()).toContain('搜索抓取');

    // 3. Switch to '博主追踪'
    await page.locator('.fmt-chip', { hasText: '博主追踪' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('input[placeholder*="@博主用户名"]').isVisible()).toBe(true);
    expect(await page.locator('button.split-btn-main').textContent()).toContain('抓取推文');

    // 4. Switch to 'X 列表'
    await page.locator('.fmt-chip', { hasText: 'X 列表' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('select.select-input').isVisible()).toBe(true);
    expect(await page.locator('select.select-input').textContent()).toContain('AI 核心圈');

    // 5. Select custom list in X 列表
    await page.locator('select.select-input').selectOption('custom');
    await page.waitForTimeout(200);
    expect(await page.locator('input[placeholder*="输入 List ID"]').isVisible()).toBe(true);

    // 6. Switch back to '关注流'
    await page.locator('.fmt-chip', { hasText: '关注流' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('input[placeholder*="过滤当前推文"]').isVisible()).toBe(true);
  });

  it('Flow 3: Split-action Crawl Button Dropdown Selection (20 / 50 / 100)', async () => {
    // Open split button dropdown
    const arrowBtn = page.locator('button.split-btn-arrow');
    await arrowBtn.click();
    await page.waitForTimeout(200);

    // Menu should be open
    const menu = page.locator('.split-btn-menu.open');
    expect(await menu.isVisible()).toBe(true);
    const menuText = await menu.textContent();
    expect(menuText).toContain('20 条 · 日常极速');
    expect(menuText).toContain('50 条 · 近期汇总');
    expect(menuText).toContain('100 条 · 深度调研');

    // Select 50 条
    await page.locator('.split-btn-item', { hasText: '50 条 · 近期汇总' }).click();
    await page.waitForTimeout(200);

    // Verify main button text updated to (50条)
    const mainBtnText = await page.locator('button.split-btn-main').textContent();
    expect(mainBtnText).toContain('50条');
  });

  it('Flow 4: Signal-to-Noise Ratio (SNR) Filter Pills', async () => {
    // Default: '全部' is active
    expect(await page.locator('.fmt-chip.active', { hasText: '全部' }).isVisible()).toBe(true);

    // Click '50+ 赞'
    await page.locator('.fmt-chip', { hasText: '50+ 赞' }).click();
    await page.waitForTimeout(400);
    expect(await page.locator('.fmt-chip.active', { hasText: '50+ 赞' }).isVisible()).toBe(true);

    // Click '200+ 赞'
    await page.locator('.fmt-chip', { hasText: '200+ 赞' }).click();
    await page.waitForTimeout(400);
    expect(await page.locator('.fmt-chip.active', { hasText: '200+ 赞' }).isVisible()).toBe(true);

    // Click back to '全部'
    await page.locator('.fmt-chip', { hasText: '全部' }).click();
    await page.waitForTimeout(400);
    expect(await page.locator('.fmt-chip.active', { hasText: '全部' }).isVisible()).toBe(true);
  });

  it('Flow 5: Following Stream Local Filter & Stream Pagination', async () => {
    const filterInput = page.locator('input[placeholder*="过滤当前推文"]');
    await filterInput.fill('karpathy');
    await page.waitForTimeout(300);

    // Verify list filtered
    const countText = await page.locator('.studio-sidebar span', { hasText: '条' }).first().textContent();
    expect(countText).toBeTruthy();

    // Clear filter
    await filterInput.fill('');
    await page.waitForTimeout(300);

    // Stream Pagination / Load More Card exists
    const loadMoreBtn = page.locator('button', { hasText: '加载更早的 50 条历史推文' });
    expect(await loadMoreBtn.isVisible()).toBe(true);
    await loadMoreBtn.click();
    await page.waitForTimeout(400);

    // Verify feed item cards are present
    const feedItems = page.locator('.feed-item');
    expect(await feedItems.count()).toBeGreaterThan(0);
  });

  it('Flow 6: Tweet Selection, Local File Reveal & Cascade Delete Confirmation', async () => {
    // Click first feed item
    await page.locator('.feed-item').first().click();
    await page.waitForTimeout(200);

    // Detail view should render
    expect(await page.locator('button', { hasText: '本地文件' }).isVisible()).toBe(true);
    expect(await page.locator('button', { hasText: '级联删除' }).isVisible()).toBe(true);

    // Click '本地文件' -> triggers toast
    await page.locator('button', { hasText: '本地文件' }).click();
    await page.waitForTimeout(200);
    const toast = page.locator('div', { hasText: '本地文件位置:' }).last();
    expect(await toast.isVisible()).toBe(true);

    // Click '级联删除' -> triggers confirmation dialog
    await page.locator('button', { hasText: '级联删除' }).click();
    await page.waitForTimeout(200);

    // Verify modal content
    const modal = page.locator('.surface', { hasText: '确认级联物理清理？' });
    expect(await modal.isVisible()).toBe(true);
    const modalText = await modal.textContent();
    expect(modalText).toContain('此操作将彻底删除推文');
    expect(modalText).toContain('output/');

    // Click '取消' to safely dismiss
    await page.locator('button', { hasText: '取消' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('.surface', { hasText: '确认级联物理清理？' }).isVisible()).toBe(false);
  });

  it('Flow 7: Trends Radar Interaction & Studio Cross-linking', async () => {
    // Navigate to Trends View
    await page.locator('.masthead-nav-item', { hasText: '趋势雷达' }).click();
    await page.waitForTimeout(300);

    // Verify categories
    expect(await page.locator('.fmt-chip', { hasText: '科技前沿' }).isVisible()).toBe(true);
    expect(await page.locator('.fmt-chip', { hasText: '全网综合' }).isVisible()).toBe(true);

    // Switch category
    await page.locator('.fmt-chip', { hasText: '商业金融' }).click();
    await page.waitForTimeout(200);

    // Check refined query tag in trend cards
    const refinedTag = page.locator('div', { hasText: 'AI 提炼检索短语:' }).first();
    expect(await refinedTag.isVisible()).toBe(true);

    // Click "查看推文" button on first card
    const viewTweetsBtn = page.locator('button', { hasText: '查看推文' }).first();
    await viewTweetsBtn.click();
    await page.waitForTimeout(300);

    // Should seamlessly jump to Studio in '全网搜索' mode
    expect(await page.locator('.fmt-chip.active', { hasText: '全网搜索' }).isVisible()).toBe(true);
    const searchInputVal = await page.locator('input[placeholder*="输入关键词或语法"]').inputValue();
    expect(searchInputVal.length).toBeGreaterThan(0);
  });

  it('Flow 8: Reports View Actionable Insights & Citation Click-to-Jump', async () => {
    // Navigate to Reports View
    await page.locator('.masthead-nav-item', { hasText: '智能研报' }).click();
    await page.waitForTimeout(300);

    // Actionable Insights card verification
    const insightsCard = page.locator('span', { hasText: 'AI 写作选题与培训大纲便签' });
    expect(await insightsCard.isVisible()).toBe(true);
    expect(await page.locator('button', { hasText: '复制大纲' }).isVisible()).toBe(true);

    // Click "复制大纲"
    await page.locator('button', { hasText: '复制大纲' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('button', { hasText: '已复制大纲' }).isVisible()).toBe(true);

    // Evidence Traceability Quote Card click-to-jump
    const quoteCard = page.locator('.surface.surface-hover', { hasText: 'Andrej Karpathy' }).first();
    expect(await quoteCard.isVisible()).toBe(true);
    await quoteCard.click();
    await page.waitForTimeout(300);

    // Should jump to Studio view
    expect(await page.locator('button.split-btn-main').isVisible()).toBe(true);
  });

  it('Flow 9: Preferences Settings Drawer & Deep Reasoning Effort Config', async () => {
    // Open Settings Drawer via Masthead button
    await page.locator('button', { hasText: '偏好设置' }).click();
    await page.waitForTimeout(300);

    // Verify Drawer title
    expect(await page.locator('h2.serif-title', { hasText: '偏好设置 (Settings)' }).isVisible()).toBe(true);

    // Verify Reasoning section
    const reasoningLabel = page.locator('.settings-label', { hasText: '深度思考推演 (Reasoning)' });
    expect(await reasoningLabel.isVisible()).toBe(true);

    // Verify Effort pills (Low / Medium / High)
    expect(await page.locator('.fmt-chip', { hasText: '轻量 (Low)' }).isVisible()).toBe(true);
    expect(await page.locator('.fmt-chip', { hasText: '标准 (Medium)' }).isVisible()).toBe(true);
    expect(await page.locator('.fmt-chip', { hasText: '深度 (High)' }).isVisible()).toBe(true);

    // Click '标准 (Medium)'
    await page.locator('.fmt-chip', { hasText: '标准 (Medium)' }).click();
    await page.waitForTimeout(200);
    expect(await page.locator('.fmt-chip.active', { hasText: '标准 (Medium)' }).isVisible()).toBe(true);

    // Click '保存配置'
    await page.locator('button', { hasText: '保存配置' }).click();
    await page.waitForTimeout(500);
    expect(await page.locator('span', { hasText: '已保存生效' }).isVisible()).toBe(true);

    // Close Settings Drawer
    await page.locator('button.text-button').click();
    await page.waitForTimeout(300);
    expect(await page.locator('h2.serif-title', { hasText: '偏好设置 (Settings)' }).isVisible()).toBe(false);
  });
});
