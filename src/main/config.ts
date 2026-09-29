import path from 'node:path';
import fs from 'node:fs';
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

  // X Credentials
  static readonly X_AUTH_TOKEN = (process.env.X_AUTH_TOKEN || '').trim();
  static readonly X_CT0 = (process.env.X_CT0 || '').trim();

  // Network / Proxy Settings
  static readonly HTTP_PROXY = (
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    ''
  ).trim();

  // LLM Settings
  static readonly LLM_PROVIDER = (process.env.LLM_PROVIDER || 'gemini').toLowerCase().trim();
  static readonly LLM_AUTH_MODE = (process.env.LLM_AUTH_MODE || 'account').toLowerCase().trim();
  static readonly LLM_MODEL = (process.env.LLM_MODEL || '').trim();

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

  // API Keys Pool
  static readonly GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
  static readonly GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  static readonly OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
  static readonly OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || '').trim();
  static readonly DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
  static readonly DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || '').trim();
  static readonly DASHSCOPE_API_KEY = (process.env.DASHSCOPE_API_KEY || '').trim();
  static readonly DASHSCOPE_BASE_URL = (process.env.DASHSCOPE_BASE_URL || '').trim();
  static readonly ZHIPUAI_API_KEY = (process.env.ZHIPUAI_API_KEY || '').trim();
  static readonly ZHIPUAI_BASE_URL = (process.env.ZHIPUAI_BASE_URL || '').trim();
  static readonly MINIMAX_API_KEY = (process.env.MINIMAX_API_KEY || '').trim();
  static readonly MINIMAX_BASE_URL = (process.env.MINIMAX_BASE_URL || '').trim();
  static readonly MOONSHOT_API_KEY = (process.env.MOONSHOT_API_KEY || '').trim();
  static readonly MOONSHOT_BASE_URL = (process.env.MOONSHOT_BASE_URL || '').trim();

  // Fetch Settings
  static readonly FETCH_MAX_PAGES = parseInt(process.env.FETCH_MAX_PAGES || '3', 10);
  static readonly FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || '60', 10);

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
