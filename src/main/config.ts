import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import dotenv from 'dotenv';
import type { XListInfo } from './types.js';

// Initialize project root
const projectRoot = process.cwd();

export class Config {
  static readonly PROJECT_ROOT = projectRoot;

  /** 当前应用版本号，优先读 package.json，兜底 0.1.2 */
  static get APP_VERSION(): string {
    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
    } catch {
      // ignore
    }
    return '0.1.2';
  }

  /**
   * 用户数据保存根目录：
   * 不区分开发态与生产态，统一由设置项指定 (环境变量 XTRACT_STORAGE_ROOT)，默认 ~/Documents/Xtract
   */
  static get STORAGE_ROOT(): string {
    const custom = (process.env.XTRACT_STORAGE_ROOT || '').trim();
    if (custom) {
      if (custom.startsWith('~')) {
        return path.join(os.homedir(), custom.slice(1));
      }
      return path.resolve(custom);
    }
    return path.join(os.homedir(), 'Documents', 'Xtract');
  }

  /** 数据与缓存固定存放于 <storageRoot>/data */
  static get DATA_DIR(): string {
    return path.join(this.STORAGE_ROOT, 'data');
  }

  /** 归档产物与研报固定存放于 <storageRoot>/articles */
  static get ARTICLES_DIR(): string {
    return path.join(this.STORAGE_ROOT, 'articles');
  }

  static get RAW_DIR(): string {
    return path.join(this.DATA_DIR, 'raw');
  }

  /** 研报与早报固定存放于 <storageRoot>/reports */
  static get REPORTS_DIR(): string {
    return path.join(this.STORAGE_ROOT, 'reports');
  }

  /** 持久化配置固定存放于 <storageRoot>/config.env */
  static get CONFIG_ENV_PATH(): string {
    return path.join(this.STORAGE_ROOT, 'config.env');
  }

  static get DB_PATH(): string {
    return path.join(this.DATA_DIR, 'tweets.db');
  }

  static get AUTH_STATE_PATH(): string {
    return path.join(this.DATA_DIR, 'auth_state.json');
  }

  static get AUTH_USER_PATH(): string {
    return path.join(this.DATA_DIR, 'auth_user.json');
  }

  static get USER_LISTS_PATH(): string {
    return path.join(this.DATA_DIR, 'user_lists.json');
  }

  static get BROWSER_PROFILE_DIR(): string {
    return path.join(this.DATA_DIR, 'browser_profile');
  }

  /** 自动确保根目录及固定二级子目录存在 */
  static ensureDirectories(): void {
    const dirs = [this.STORAGE_ROOT, this.DATA_DIR, this.ARTICLES_DIR, this.REPORTS_DIR, this.RAW_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * 双轨级联加载持久化环境变量：
   * 1. 加载源码目录 .env（开发态兜底）
   * 2. 加载默认用户数据根目录 ~/Documents/Xtract/config.env
   * 3. 若配置了自定义存储根目录，加载对应 <storageRoot>/config.env（覆盖同名配置）
   */
  static loadPersistentConfig(): void {
    // 1. 加载开发态根目录 .env
    const rootEnv = path.join(this.PROJECT_ROOT, '.env');
    if (fs.existsSync(rootEnv)) {
      dotenv.config({ path: rootEnv });
    }

    // 2. 加载默认用户数据根目录 ~/Documents/Xtract/config.env
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const defaultRoot = path.join(os.homedir(), 'Documents', 'Xtract');
    const defaultEnv = path.join(defaultRoot, 'config.env');
    const skipDefaultRoot = isTest && Boolean(process.env.XTRACT_STORAGE_ROOT);
    if (!skipDefaultRoot && fs.existsSync(defaultEnv)) {
      try {
        const parsed = dotenv.parse(fs.readFileSync(defaultEnv, 'utf-8'));
        for (const [k, v] of Object.entries(parsed)) {
          if (k === 'XTRACT_STORAGE_ROOT' && !v.trim()) {
            continue;
          }
          process.env[k] = v;
        }
      } catch {
        // ignore
      }
    }

    // 3. 若配置了非默认存储根目录，加载自定义目录下的 config.env
    const currentEnv = this.CONFIG_ENV_PATH;
    if (currentEnv !== defaultEnv && fs.existsSync(currentEnv)) {
      try {
        const parsed = dotenv.parse(fs.readFileSync(currentEnv, 'utf-8'));
        for (const [k, v] of Object.entries(parsed)) {
          process.env[k] = v;
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * 持久化配置保存：
   * 1. 增量写入当前存储根目录下的 <storageRoot>/config.env
   * 2. 若使用自定义存储根目录，在默认根目录中记录 XTRACT_STORAGE_ROOT 引导指针
   * 3. 在开发态若工程根目录存在 .env 则同步更新
   */
  static savePersistentConfig(updates: Record<string, string>): void {
    this.ensureDirectories();

    const targetFile = this.CONFIG_ENV_PATH;
    let content = '';
    if (fs.existsSync(targetFile)) {
      try {
        content = fs.readFileSync(targetFile, 'utf-8');
      } catch {
        content = '';
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'XTRACT_STORAGE_ROOT' && !value.trim()) {
        const regex = new RegExp(`^${key}=.*$\\n?`, 'm');
        content = content.replace(regex, '');
        continue;
      }
      // 先移除该键的全部历史行——**含被注释的占位行**。
      // 原实现用 `^KEY=` 只能命中原有未注释行，遇到 `#KEY=` 占位时会走追加分支，
      // 导致同一份 config.env 同时存在注释行与新行，解析结果依赖 dotenv 实现细节。
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const strip = new RegExp(`^#?${escaped}=.*$\\n?`, 'gm');
      content = content.replace(strip, '');
      content = content ? `${content.trim()}\n${key}=${value}` : `${key}=${value}`;
    }

    try {
      fs.writeFileSync(targetFile, content.trim() + '\n', 'utf-8');
    } catch (err) {
      process.stderr.write(`⚠️ 写入持久化配置 ${targetFile} 失败: ${err}\n`);
    }

    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

    // 若非默认根目录，在默认根目录中写入/清理引导指针 (测试环境下不写入宿主目录)
    const defaultRoot = path.join(os.homedir(), 'Documents', 'Xtract');
    const defaultEnv = path.join(defaultRoot, 'config.env');
    if (!isTest && updates.XTRACT_STORAGE_ROOT !== undefined) {
      const customRoot = updates.XTRACT_STORAGE_ROOT.trim();
      if (customRoot && targetFile !== defaultEnv) {
        try {
          if (!fs.existsSync(defaultRoot)) {
            fs.mkdirSync(defaultRoot, { recursive: true });
          }
          let defContent = fs.existsSync(defaultEnv) ? fs.readFileSync(defaultEnv, 'utf-8') : '';
          const regex = /^XTRACT_STORAGE_ROOT=.*$/m;
          if (regex.test(defContent)) {
            defContent = defContent.replace(regex, `XTRACT_STORAGE_ROOT=${customRoot}`);
          } else {
            defContent = defContent
              ? `${defContent.trim()}\nXTRACT_STORAGE_ROOT=${customRoot}`
              : `XTRACT_STORAGE_ROOT=${customRoot}`;
          }
          fs.writeFileSync(defaultEnv, defContent.trim() + '\n', 'utf-8');
        } catch {
          // ignore
        }
      } else if (!customRoot && fs.existsSync(defaultEnv)) {
        try {
          let defContent = fs.readFileSync(defaultEnv, 'utf-8');
          defContent = defContent.replace(/^XTRACT_STORAGE_ROOT=.*$\n?/m, '');
          fs.writeFileSync(defaultEnv, defContent.trim() + '\n', 'utf-8');
        } catch {
          // ignore
        }
      }
    }

    // 开发态同步写入根目录 .env (测试环境除外)
    if (!isTest) {
      const devEnvPath = path.join(this.PROJECT_ROOT, '.env');
      if (fs.existsSync(devEnvPath)) {
        try {
          let devContent = fs.readFileSync(devEnvPath, 'utf-8');
          for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(devContent)) {
              devContent = devContent.replace(regex, `${key}=${value}`);
            } else {
              devContent = devContent ? `${devContent.trim()}\n${key}=${value}` : `${key}=${value}`;
            }
          }
          fs.writeFileSync(devEnvPath, devContent.trim() + '\n', 'utf-8');
        } catch {
          // packaged app read-only ignore
        }
      }
    }
  }

  // X Credentials (动态 getter，响应会话更新与热重载)
  static get X_AUTH_TOKEN(): string {
    return (process.env.X_AUTH_TOKEN || '').trim();
  }
  static get X_CT0(): string {
    return (process.env.X_CT0 || '').trim();
  }

  // Network / Proxy Settings (动态探测与智能回退)
  private static _detectedProxy: string | null = null;

  static get HTTP_PROXY(): string {
    return (
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy ||
      this._detectedProxy ||
      ''
    ).trim();
  }

  static async detectLocalProxy(): Promise<string> {
    if (this.HTTP_PROXY) return this.HTTP_PROXY;

    // 常见科学上网客户端本地默认端口：Clash Verge (8118/7890/7897), Surge (6152), V2Ray/Qv2ray (10808/10809/1087)
    const candidates = [8118, 7890, 7897, 1087, 6152, 10808, 10809];
    for (const port of candidates) {
      const alive = await this.probePort(port, '127.0.0.1', 80);
      if (alive) {
        const proxyUrl = `http://127.0.0.1:${port}`;
        this._detectedProxy = proxyUrl;
        process.env.HTTP_PROXY = proxyUrl;
        process.env.http_proxy = proxyUrl;
        process.stderr.write(`ℹ️ 自动识别并接通本机正在运行的代理服务: ${proxyUrl}\n`);
        return proxyUrl;
      }
    }
    return '';
  }

  private static probePort(port: number, host = '127.0.0.1', timeout = 80): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });
  }

  // LLM Settings (动态 getter)
  static get LLM_PROVIDER(): string {
    return (process.env.LLM_PROVIDER || 'gemini').toLowerCase().trim();
  }
  static get LLM_AUTH_MODE(): string {
    return (process.env.LLM_AUTH_MODE || 'account').toLowerCase().trim();
  }
  static get LLM_MODEL(): string {
    return (process.env.LLM_MODEL || '').trim();
  }

  // Reasoning Settings
  static get LLM_REASONING_ENABLED(): boolean {
    return (process.env.LLM_REASONING_ENABLED || 'true').toLowerCase().trim() !== 'false';
  }

  static get LLM_REASONING_EFFORT(): 'low' | 'medium' | 'high' {
    const effort = (process.env.LLM_REASONING_EFFORT || 'high').toLowerCase().trim();
    if (effort === 'low' || effort === 'medium' || effort === 'high') {
      return effort;
    }
    return 'high';
  }

  // API Keys Pool (动态 getter)
  static get GEMINI_API_KEY(): string { return (process.env.GEMINI_API_KEY || '').trim(); }
  static get GEMINI_MODEL(): string { return (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(); }
  static get OPENAI_API_KEY(): string { return (process.env.OPENAI_API_KEY || '').trim(); }
  static get OPENAI_BASE_URL(): string { return (process.env.OPENAI_BASE_URL || '').trim(); }
  static get DEEPSEEK_API_KEY(): string { return (process.env.DEEPSEEK_API_KEY || '').trim(); }
  static get DEEPSEEK_BASE_URL(): string { return (process.env.DEEPSEEK_BASE_URL || '').trim(); }
  static get DASHSCOPE_API_KEY(): string { return (process.env.DASHSCOPE_API_KEY || '').trim(); }
  static get DASHSCOPE_BASE_URL(): string { return (process.env.DASHSCOPE_BASE_URL || '').trim(); }
  static get ZHIPUAI_API_KEY(): string { return (process.env.ZHIPUAI_API_KEY || '').trim(); }
  static get ZHIPUAI_BASE_URL(): string { return (process.env.ZHIPUAI_BASE_URL || '').trim(); }
  static get MINIMAX_API_KEY(): string { return (process.env.MINIMAX_API_KEY || '').trim(); }
  static get MINIMAX_BASE_URL(): string { return (process.env.MINIMAX_BASE_URL || '').trim(); }
  static get MOONSHOT_API_KEY(): string { return (process.env.MOONSHOT_API_KEY || '').trim(); }
  static get MOONSHOT_BASE_URL(): string { return (process.env.MOONSHOT_BASE_URL || '').trim(); }

  // Fetch Settings
  static get FETCH_MAX_PAGES(): number {
    return parseInt(process.env.FETCH_MAX_PAGES || '3', 10);
  }
  static get FETCH_TIMEOUT(): number {
    return parseInt(process.env.FETCH_TIMEOUT || '60', 10);
  }
  // Crawl Filter Settings (默认仅抓取长推文 Note Tweet 与专栏文章 X Article)
  static get FETCH_ONLY_LONG_TWEETS(): boolean {
    return (process.env.FETCH_ONLY_LONG_TWEETS || 'true').toLowerCase().trim() !== 'false';
  }
  // Single Tweet Author Replies Filter (单篇推文抓取时是否抓取作者追评/追加回复，默认关闭)
  static get FETCH_AUTHOR_REPLIES(): boolean {
    return (process.env.FETCH_AUTHOR_REPLIES || 'false').toLowerCase().trim() === 'true';
  }

  static ensureDirs(): void {
    for (const dir of [this.DATA_DIR, this.RAW_DIR, this.REPORTS_DIR, this.BROWSER_PROFILE_DIR]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  static hasXCredentials(): boolean {
    return fs.existsSync(this.AUTH_STATE_PATH) || Boolean(this.X_AUTH_TOKEN && this.X_CT0);
  }

  static getCachedUser(): { id: string; name: string; screen_name: string; verified_at?: string } | null {
    try {
      if (fs.existsSync(this.AUTH_USER_PATH)) {
        const raw = fs.readFileSync(this.AUTH_USER_PATH, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return null;
  }

  static setCachedUser(user: { id: string; name: string; screen_name: string }): void {
    try {
      this.ensureDirs();
      const payload = {
        ...user,
        verified_at: new Date().toISOString(),
      };
      fs.writeFileSync(this.AUTH_USER_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      process.stderr.write(`⚠️ 保存账号缓存失败: ${err}\n`);
    }
  }

  static getUserLists(): XListInfo[] {
    try {
      if (fs.existsSync(this.USER_LISTS_PATH)) {
        const raw = fs.readFileSync(this.USER_LISTS_PATH, 'utf-8');
        const lists = JSON.parse(raw);
        if (Array.isArray(lists)) {
          // Filter out known legacy fake mock list IDs
          const valid = lists.filter((l) => l.id !== '1827364512938' && l.id !== '1827364512939');
          if (valid.length > 0) {
            return valid;
          }
        }
      }
    } catch {
      // ignore
    }
    // Default initial lists for user cza55008
    return [
      { id: '2100985900734062922', name: 'AI与自媒体', member_count: 6 },
      { id: '1903106960452620743', name: '独立开发者', member_count: 9 },
      { id: '2099841674906333692', name: '素材库', member_count: 51 },
      { id: '1603383227531800576', name: '文学', member_count: 1 },
    ];
  }

  static saveUserList(list: XListInfo): void {
    try {
      this.ensureDirs();
      const current = this.getUserLists();
      const index = current.findIndex((item) => item.id === list.id);
      if (index >= 0) {
        current[index] = { ...current[index], ...list };
      } else {
        current.push(list);
      }
      fs.writeFileSync(this.USER_LISTS_PATH, JSON.stringify(current, null, 2), 'utf-8');
    } catch (err) {
      process.stderr.write(`⚠️ 保存列表缓存失败: ${err}\n`);
    }
  }

  static deleteUserList(listId: string): void {
    try {
      this.ensureDirs();
      const current = this.getUserLists().filter((item) => item.id !== listId);
      fs.writeFileSync(this.USER_LISTS_PATH, JSON.stringify(current, null, 2), 'utf-8');
    } catch (err) {
      process.stderr.write(`⚠️ 删除列表缓存失败: ${err}\n`);
    }
  }
}

// 自动加载持久化配置（级联 .env 与 <storageRoot>/config.env）
Config.loadPersistentConfig();

