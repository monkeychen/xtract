import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import dotenv from 'dotenv';
import type { XListInfo } from './types.js';

// Load .env
const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env') });

export class Config {
  static readonly PROJECT_ROOT = projectRoot;
  static readonly DATA_DIR = path.join(projectRoot, 'data');
  static readonly RAW_DIR = path.join(projectRoot, 'data', 'raw');
  static readonly REPORTS_DIR = path.join(projectRoot, 'output', 'reports');
  static readonly DB_PATH = path.join(projectRoot, 'data', 'tweets.db');
  static readonly AUTH_STATE_PATH = path.join(projectRoot, 'data', 'auth_state.json');
  static readonly AUTH_USER_PATH = path.join(projectRoot, 'data', 'auth_user.json');
  static readonly USER_LISTS_PATH = path.join(projectRoot, 'data', 'user_lists.json');
  static readonly BROWSER_PROFILE_DIR = path.join(projectRoot, 'data', 'browser_profile');

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
