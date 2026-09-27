import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAICompatProvider,
  GeminiAccountProvider,
  getLLMProvider,
  PROVIDER_CONFIGS,
} from '../src/main/llm/index.js';

describe('LLM Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly maps provider aliases and defaults', () => {
    const pGpt = new OpenAICompatProvider({ provider: 'gpt', apiKey: 'test-key' });
    expect(pGpt.providerName).toContain('OPENAI');
    expect(pGpt.defaultModel).toBe('gpt-5.6-sol');

    const pGlm = new OpenAICompatProvider({ provider: 'glm', apiKey: 'test-key' });
    expect(pGlm.providerName).toContain('ZHIPU');
    expect(pGlm.defaultModel).toBe('glm-5.3-flash');

    const pDeepSeek = new OpenAICompatProvider({ provider: 'deepseek', apiKey: 'test-key' });
    expect(pDeepSeek.providerName).toContain('DEEPSEEK');
    expect(pDeepSeek.defaultModel).toBe('deepseek-flash');
  });

  it('auto-routes Alibaba Token Plan when key starts with sk-sp-', () => {
    const pQwenTokenPlan = new OpenAICompatProvider({
      provider: 'qwen',
      apiKey: 'sk-sp-1234567890',
    });
    expect(pQwenTokenPlan.providerName).toContain('Token Plan');
    // Base URL should be the dedicated Token Plan endpoint
    expect(pQwenTokenPlan['baseUrl']).toContain('token-plan.cn-beijing.maas.aliyuncs.com');
  });

  it('auto-routes Zhipu Coding Plan when specified', () => {
    const pZhipuCoding = new OpenAICompatProvider({
      provider: 'zhipu_code_plan',
      apiKey: 'test-key',
    });
    expect(pZhipuCoding.providerName).toContain('Code Plan');
    expect(pZhipuCoding['baseUrl']).toContain('/coding/');
  });

  it('normalizes model names and aliases', () => {
    const pSol = new OpenAICompatProvider({
      provider: 'openai',
      apiKey: 'test-key',
      modelName: 'gpt-5.6',
    });
    expect(pSol.modelName).toBe('gpt-5.6-sol');

    const pTokenPlanModel = new OpenAICompatProvider({
      provider: 'qwen_token_plan',
      apiKey: 'test-key',
      modelName: 'qwen-plus',
    });
    expect(pTokenPlanModel.modelName).toBe('qwen3.7-plus');
  });

  it('throws helpful error when API key is missing', async () => {
    const provider = new OpenAICompatProvider({
      provider: 'deepseek',
      apiKey: '',
    });
    await expect(provider.generate('Hello')).rejects.toThrow('未配置 API Key');
  });

  it('correctly parses SSE stream chunks with reasoning and content', async () => {
    const provider = new OpenAICompatProvider({
      provider: 'deepseek',
      apiKey: 'test-key',
      baseUrl: 'https://mock.api',
    });

    const sseData = [
      'data: {"choices":[{"delta":{"reasoning_content":"Let me think."}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" Still thinking."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Final answer."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    } as any);

    const chunks: Array<{ type: string; text: string }> = [];
    const result = await provider.generate('Test prompt', {
      onChunk: (c) => chunks.push(c),
    });

    expect(result).toBe('Final answer.');
    expect(chunks).toEqual([
      { type: 'reasoning', text: 'Let me think.' },
      { type: 'reasoning', text: ' Still thinking.' },
      { type: 'content', text: 'Final answer.' },
    ]);
  });

  it('getLLMProvider factory instantiates account and api providers correctly', () => {
    const geminiAccount = getLLMProvider('gemini', 'account');
    expect(geminiAccount).toBeInstanceOf(GeminiAccountProvider);

    const deepseekApi = getLLMProvider('deepseek', 'api_key');
    expect(deepseekApi).toBeInstanceOf(OpenAICompatProvider);
  });
});
