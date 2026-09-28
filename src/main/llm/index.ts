import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Config } from '../config.js';
import type { StreamChunk } from '../types.js';

export interface GenerateOptions {
  systemPrompt?: string;
  images?: string[];
  stream?: boolean;
  reasoningEnabled?: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
  onChunk?: (chunk: StreamChunk) => void;
}

export function applyReasoningParameters(
  payload: Record<string, any>,
  providerKey: string,
  enabled: boolean,
  effort: 'low' | 'medium' | 'high'
): void {
  if (!enabled) {
    if (providerKey.includes('zhipu')) {
      payload.thinking = { type: 'disabled' };
    } else if (providerKey.includes('qwen')) {
      payload.enable_thinking = false;
    } else if (providerKey.includes('deepseek')) {
      payload.thinking = { type: 'disabled' };
    } else if (providerKey.includes('minimax')) {
      payload.thinking = { type: 'disabled' };
    } else if (providerKey.includes('gemini')) {
      payload.thinking_config = { thinking_level: 'NONE' };
    }
    delete payload.reasoning_effort;
    return;
  }

  // Reasoning enabled: dynamically map vendor-specific parameters and effort levels
  if (providerKey.includes('zhipu')) {
    payload.thinking = { type: 'enabled' };
    payload.reasoning_effort = effort;
  } else if (providerKey.includes('qwen')) {
    payload.enable_thinking = true;
    payload.reasoning_effort = effort;
  } else if (providerKey.includes('deepseek')) {
    payload.thinking = { type: 'enabled' };
    payload.reasoning_effort = effort;
  } else if (providerKey.includes('minimax')) {
    payload.thinking = { type: 'enabled' };
    payload.reasoning_split = true;
    payload.reasoning_effort = effort;
  } else if (providerKey.includes('kimi')) {
    payload.reasoning_effort = effort;
  } else if (providerKey.includes('gemini')) {
    payload.reasoning_effort = effort;
    payload.thinking_config = { thinking_level: effort.toUpperCase() };
  } else {
    payload.reasoning_effort = effort;
  }
}

export interface BaseLLMProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly defaultModel: string;
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
}

export interface ProviderConfig {
  baseUrl: string;
  defaultModel: string;
  envKey: string;
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-sol',
    envKey: 'OPENAI_API_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    envKey: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.8-flash',
    envKey: 'DASHSCOPE_API_KEY',
  },
  qwen_token_plan: {
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.8-flash',
    envKey: 'DASHSCOPE_API_KEY',
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.3-flash',
    envKey: 'ZHIPUAI_API_KEY',
  },
  zhipu_code_plan: {
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    defaultModel: 'glm-5.3-flash',
    envKey: 'ZHIPUAI_API_KEY',
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-M3',
    envKey: 'MINIMAX_API_KEY',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
    envKey: 'MOONSHOT_API_KEY',
  },
  gemini_api: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    envKey: 'GEMINI_API_KEY',
  },
  custom: {
    baseUrl: '',
    defaultModel: 'gpt-5.6-sol',
    envKey: 'OPENAI_API_KEY',
  },
};

export class OpenAICompatProvider implements BaseLLMProvider {
  private readonly providerKey: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  readonly modelName: string;
  readonly defaultModel: string;
  private readonly isTokenPlan: boolean;
  private proxyAgent?: any;

  constructor(options?: {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
  }) {
    const rawProvider = (options?.provider || 'openai').toLowerCase().replace(/-/g, '_');
    const aliasMap: Record<string, string> = {
      gpt: 'openai',
      glm: 'zhipu',
      glm_code_plan: 'zhipu_code_plan',
      glm_coding: 'zhipu_code_plan',
      zhipu_coding: 'zhipu_code_plan',
      qwen_coding: 'qwen_token_plan',
      gemini: 'gemini_api',
      google: 'gemini_api',
    };
    this.providerKey = aliasMap[rawProvider] || rawProvider;
    const cfg = PROVIDER_CONFIGS[this.providerKey] || PROVIDER_CONFIGS.custom;

    // Resolve API key
    const envKeyVal = (Config as unknown as Record<string, string>)[cfg.envKey] || '';
    this.apiKey = options?.apiKey || envKeyVal;

    // Dynamic endpoint resolution with intelligent auto-deduction
    let resolvedBaseUrl = options?.baseUrl;
    if (!resolvedBaseUrl) {
      if (this.providerKey.includes('qwen')) {
        if (Config.DASHSCOPE_BASE_URL) {
          resolvedBaseUrl = Config.DASHSCOPE_BASE_URL;
        } else if (this.providerKey === 'qwen_token_plan' || (this.apiKey && this.apiKey.startsWith('sk-sp-'))) {
          // Auto-detect Alibaba Model Studio Token Plan dedicated key (sk-sp-)
          resolvedBaseUrl = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
        } else {
          resolvedBaseUrl = cfg.baseUrl;
        }
      } else if (this.providerKey.includes('zhipu')) {
        if (Config.ZHIPUAI_BASE_URL) {
          resolvedBaseUrl = Config.ZHIPUAI_BASE_URL;
        } else if (this.providerKey === 'zhipu_code_plan') {
          resolvedBaseUrl = 'https://open.bigmodel.cn/api/coding/paas/v4';
        } else {
          resolvedBaseUrl = cfg.baseUrl;
        }
      } else if (this.providerKey.includes('kimi')) {
        resolvedBaseUrl = Config.MOONSHOT_BASE_URL || cfg.baseUrl;
      } else if (this.providerKey.includes('deepseek')) {
        resolvedBaseUrl = Config.DEEPSEEK_BASE_URL || cfg.baseUrl;
      } else if (this.providerKey.includes('minimax')) {
        resolvedBaseUrl = Config.MINIMAX_BASE_URL || cfg.baseUrl;
      } else if (this.providerKey === 'openai') {
        resolvedBaseUrl = Config.OPENAI_BASE_URL || cfg.baseUrl;
      } else {
        resolvedBaseUrl = Config.OPENAI_BASE_URL || cfg.baseUrl;
      }
    }

    this.baseUrl = (resolvedBaseUrl || '').replace(/\/+$/, '');
    this.defaultModel = cfg.defaultModel;
    this.isTokenPlan = this.providerKey === 'qwen_token_plan' || this.baseUrl.includes('token-plan');

    // Model name resolution
    let targetModel = options?.modelName || Config.LLM_MODEL;
    if (!targetModel) {
      targetModel = this.defaultModel;
    } else {
      const lower = targetModel.toLowerCase().trim();
      if (lower === 'gpt-5.6 sol' || lower === 'gpt-5.6-sol' || lower === 'gpt-5.6') {
        targetModel = 'gpt-5.6-sol';
      } else if (this.isTokenPlan) {
        const tokenPlanMap: Record<string, string> = {
          'qwen-plus': 'qwen3.7-plus',
          'qwen-max': 'qwen3.8-max',
          'qwen-turbo': 'qwen3.8-flash',
          'qwen-flash': 'qwen3.8-flash',
        };
        targetModel = tokenPlanMap[lower] || targetModel;
      }
    }
    this.modelName = targetModel;

    // Proxy agent setup if needed (Node CLI only)
    if (
      Config.HTTP_PROXY &&
      !(process as any).versions?.electron &&
      (this.providerKey.includes('openai') || this.providerKey.includes('gemini'))
    ) {
      import('undici')
        .then(({ ProxyAgent }) => {
          this.proxyAgent = new ProxyAgent(Config.HTTP_PROXY);
        })
        .catch(() => {});
    }
  }

  get providerName(): string {
    if (this.isTokenPlan) {
      return 'Qwen (Token Plan · 专属套餐)';
    }
    if (this.providerKey === 'zhipu_code_plan' || this.baseUrl.includes('/coding/')) {
      return 'Zhipu (Code Plan · 专属套餐)';
    }
    return `${this.providerKey.toUpperCase()} (API Key)`;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error(`调用 ${this.providerName} 失败：未配置 API Key。请在 .env 中设置相应密钥。`);
    }

    const messages: Array<{ role: string; content: any }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    // Multimodal or simple text
    if (options?.images && options.images.length > 0) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: prompt },
      ];
      for (const img of options.images) {
        if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')) {
          parts.push({ type: 'image_url', image_url: { url: img } });
        } else if (fs.existsSync(img)) {
          const ext = path.extname(img).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          const b64 = fs.readFileSync(img).toString('base64');
          parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } });
        }
      }
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const payload: Record<string, any> = {
      model: this.modelName,
      messages,
    };

    // Dynamic reasoning parameter injection based on configuration & options
    const reasoningEnabled =
      options?.reasoningEnabled !== undefined
        ? options.reasoningEnabled
        : Config.LLM_REASONING_ENABLED;
    const reasoningEffort = options?.reasoningEffort || Config.LLM_REASONING_EFFORT;

    applyReasoningParameters(payload, this.providerKey, reasoningEnabled, reasoningEffort);

    const stream = options?.stream !== false;
    const endpoint = `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions: any = {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, stream }),
    };
    if (this.proxyAgent) {
      fetchOptions.dispatcher = this.proxyAgent;
    }

    const response = await fetch(endpoint, fetchOptions);
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`LLM API 请求失败 [${response.status}]: ${errText.slice(0, 300)}`);
    }

    if (!stream) {
      const data: any = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content || choice?.message?.reasoning_content || '';
      if (!content) {
        throw new Error(`LLM 未返回有效内容 (提供商: ${this.providerKey}, 模型: ${this.modelName})`);
      }
      return content.trim();
    }

    if (!response.body) {
      throw new Error('LLM API 响应为空 (无 Response Body)');
    }

    const collectedContent: string[] = [];
    const collectedReasoning: string[] = [];
    let hasPrintedThinking = false;
    let hasPrintedContent = false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') break;

        try {
          const chunk = JSON.parse(dataStr);
          const delta = chunk?.choices?.[0]?.delta;
          if (!delta) continue;

          const r = delta.reasoning_content || delta.reasoning || delta.thinking;
          const c = delta.content;

          if (r) {
            if (!hasPrintedThinking) {
              process.stderr.write('  ↳ ⚡ 已建立流式通道，正在深度推理与多方观点推演...\n');
              hasPrintedThinking = true;
            }
            collectedReasoning.push(r);
            options?.onChunk?.({ type: 'reasoning', text: r });
          }

          if (c) {
            if (!hasPrintedContent) {
              process.stderr.write('  ↳ ✍️ 思考推演完成，正在生成结构化研报正文...\n');
              hasPrintedContent = true;
            }
            collectedContent.push(c);
            options?.onChunk?.({ type: 'content', text: c });
          }
        } catch {
          // ignore partial JSON parse errors
        }
      }
    }

    let result = collectedContent.join('').trim();
    if (!result && collectedReasoning.length > 0) {
      result = collectedReasoning.join('').trim();
    }

    if (!result) {
      throw new Error(`LLM 未返回有效内容 (提供商: ${this.providerKey}, 模型: ${this.modelName})`);
    }

    return result;
  }
}

export class GeminiAccountProvider implements BaseLLMProvider {
  readonly defaultModel = 'gemini-3.8-flash';
  readonly modelName: string;

  constructor(modelName?: string) {
    this.modelName = modelName || Config.GEMINI_MODEL || this.defaultModel;
  }

  get providerName(): string {
    return 'Google Gemini (Account Mode · 订阅配额)';
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const fullPrompt = options?.systemPrompt
      ? `${options.systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    const reasoningEnabled =
      options?.reasoningEnabled !== undefined
        ? options.reasoningEnabled
        : Config.LLM_REASONING_ENABLED;
    const reasoningEffort = options?.reasoningEffort || Config.LLM_REASONING_EFFORT;

    // 1. Try invoking local agy CLI (Google account channel)
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const args = [
          '-p',
          fullPrompt,
          '--model',
          this.modelName,
          '--output-format',
          'text',
          '--dangerously-skip-permissions',
        ];
        if (reasoningEnabled) {
          args.splice(4, 0, '--effort', reasoningEffort);
        }
        const child = spawn('agy', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('close', (code) => {
          if (code === 0 && stdout.trim()) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`agy exited with code ${code}: ${stderr}`));
          }
        });
        child.on('error', (err) => reject(err));
      });
      return output;
    } catch {
      // agy not found or failed, try fallback
    }

    // 2. Fallback to API Key mode if GEMINI_API_KEY is configured
    if (Config.GEMINI_API_KEY) {
      const apiProvider = new OpenAICompatProvider({
        provider: 'gemini_api',
        modelName: this.modelName,
      });
      return apiProvider.generate(prompt, options);
    }

    throw new Error(
      '无法使用 Google Gemini 账号认证生成内容：未检测到已登录的本地 Google 账号环境。\n' +
        '建议在 .env 中设置 GEMINI_API_KEY。'
    );
  }
}

export function getLLMProvider(
  provider?: string,
  authMode?: string,
  model?: string
): BaseLLMProvider {
  const prov = (provider || Config.LLM_PROVIDER || 'gemini').toLowerCase().trim();
  const mode = (authMode || Config.LLM_AUTH_MODE || 'account').toLowerCase().trim();
  const targetModel = model || Config.LLM_MODEL || undefined;

  if (mode === 'account') {
    if (prov === 'gemini' || prov === 'google') {
      return new GeminiAccountProvider(targetModel);
    }
    // For other account providers not yet logged in, give clear guidance
    if (prov === 'openai' || prov === 'chatgpt' || prov === 'gpt') {
      // Check if API key is present as seamless fallback
      if (Config.OPENAI_API_KEY) {
        return new OpenAICompatProvider({ provider: 'openai', modelName: targetModel });
      }
      throw new Error(
        `OpenAI 账号认证暂未配置凭据。\n请配置 --auth-mode api_key 并在 .env 设置 OPENAI_API_KEY。`
      );
    }
    throw new Error(
      `厂商 '${prov}' 暂不支持账号订阅认证模式（目前支持 gemini 与 openai）。\n` +
        `请配置 --auth-mode api_key 并在 .env 设置相应 API Key。`
    );
  }

  // API-Key mode
  return new OpenAICompatProvider({ provider: prov, modelName: targetModel });
}
