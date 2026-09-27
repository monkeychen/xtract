import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

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
    for (const dir of [this.DATA_DIR, this.RAW_DIR, this.REPORTS_DIR]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  static hasXCredentials(): boolean {
    return fs.existsSync(this.AUTH_STATE_PATH) || Boolean(this.X_AUTH_TOKEN && this.X_CT0);
  }
}
