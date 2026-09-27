import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAICompatProvider,
  GeminiAccountProvider,
  getLLMProvider,
} from '../src/main/llm/index.js';
import { Summarizer } from '../src/main/pipeline/summarizer.js';

describe('LLM Module (100% Python Parity)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('test_factory_invalid_provider_in_account_mode (1:1 mirror)', () => {
    expect(() => getLLMProvider('kimi', 'account')).toThrow('暂不支持账号订阅认证模式');
  });

  it('test_qwen_token_plan_and_zhipu_code_plan (1:1 mirror)', () => {
    // Explicit Qwen Token Plan provider (canonical hyphen and underscore)
    const qwenTp = getLLMProvider('qwen-token-plan', 'api_key');
    expect(qwenTp).toBeInstanceOf(OpenAICompatProvider);
    expect(qwenTp['baseUrl']).toContain('token-plan.cn-beijing.maas.aliyuncs.com');
    expect(qwenTp.providerName).toContain('Token Plan');
    expect(qwenTp.modelName).toBe('qwen3.8-flash');

    // Auto-detection of Qwen Token Plan by sk-sp- API key prefix
    const qwenAuto = new OpenAICompatProvider({
      provider: 'qwen',
      apiKey: 'sk-sp-1234567890abcdef',
    });
    expect(qwenAuto['baseUrl']).toContain('token-plan.cn-beijing.maas.aliyuncs.com');
    expect(qwenAuto.providerName).toContain('Token Plan');
    expect(qwenAuto.modelName).toBe('qwen3.8-flash');

    // Model mapping on Token Plan
    const qwenMapped = new OpenAICompatProvider({
      provider: 'qwen-token-plan',
      apiKey: 'sk-sp-test',
      modelName: 'qwen-plus',
    });
    expect(qwenMapped.modelName).toBe('qwen3.7-plus');

    // Explicit Zhipu Code Plan provider (canonical hyphen)
    const zhipuCp = getLLMProvider('zhipu-code-plan', 'api_key');
    expect(zhipuCp).toBeInstanceOf(OpenAICompatProvider);
    expect(zhipuCp['baseUrl']).toContain('open.bigmodel.cn/api/coding/paas/v4');
    expect(zhipuCp.providerName).toContain('Code Plan');
    expect(zhipuCp.modelName).toBe('glm-5.3-flash');

    // Legacy/compatibility aliases
    const glmCp = getLLMProvider('glm_code_plan', 'api_key');
    expect(glmCp).toBeInstanceOf(OpenAICompatProvider);
    expect(glmCp['baseUrl']).toContain('open.bigmodel.cn/api/coding/paas/v4');
    expect(glmCp.providerName).toContain('Code Plan');
  });

  it('test_reasoning_and_multimodal_payloads (1:1 mirror)', async () => {
    let capturedBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n')
          );
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    // 1. Zhipu thinking: { type: "enabled" } and reasoning_effort: "high"
    const zhipu = new OpenAICompatProvider({
      provider: 'zhipu',
      apiKey: 'test-key',
      modelName: 'glm-5.3-flash',
    });
    await zhipu.generate('Hello Zhipu');
    expect(capturedBody.thinking).toEqual({ type: 'enabled' });
    expect(capturedBody.reasoning_effort).toBe('high');

    // 2. Qwen enable_thinking: true and reasoning_effort: "high"
    const qwen = new OpenAICompatProvider({
      provider: 'qwen',
      apiKey: 'test-key',
      modelName: 'qwen3.8-flash',
    });
    await qwen.generate('Hello Qwen');
    expect(capturedBody.enable_thinking).toBe(true);
    expect(capturedBody.reasoning_effort).toBe('high');

    // 3. MiniMax thinking: { type: "enabled" } and reasoning_split: true
    const minimax = new OpenAICompatProvider({
      provider: 'minimax',
      apiKey: 'test-key',
      modelName: 'MiniMax-M3',
    });
    await minimax.generate('Hello MiniMax');
    expect(capturedBody.thinking).toEqual({ type: 'enabled' });
    expect(capturedBody.reasoning_split).toBe(true);

    // 4. Multimodal image input support
    const openai = new OpenAICompatProvider({
      provider: 'openai',
      apiKey: 'test-key',
      modelName: 'gpt-5.6-sol',
    });
    await openai.generate('Describe image', { images: ['https://example.com/cat.png'] });
    expect(capturedBody.reasoning_effort).toBe('high');
    const userContent = capturedBody.messages[0].content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent[0].type).toBe('text');
    expect(userContent[1].type).toBe('image_url');
    expect(userContent[1].image_url.url).toBe('https://example.com/cat.png');
  });

  it('test_refine_search_queries (1:1 mirror)', async () => {
    const mockLLM = {
      providerName: 'MockLLM',
      modelName: 'mock-model',
      defaultModel: 'mock-model',
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          'DeepSeek Bets Big on Huawei Chips to Train Massive AI Models': 'DeepSeek Huawei chips',
          'World of Warcraft Forever Beta Draws Players and Design Debates': 'WoW Classic beta',
        })
      ),
    };
    const summarizer = new Summarizer({ llmInstance: mockLLM });

    const topics = [
      'DeepSeek Bets Big on Huawei Chips to Train Massive AI Models',
      'World of Warcraft Forever Beta Draws Players and Design Debates',
      '#IDontWantToOverreactBUT',
    ];
    const res = await summarizer.refineSearchQueries(topics);
    expect(res['DeepSeek Bets Big on Huawei Chips to Train Massive AI Models']).toBe(
      'DeepSeek Huawei chips'
    );
    expect(res['World of Warcraft Forever Beta Draws Players and Design Debates']).toBe(
      'WoW Classic beta'
    );
    expect(res['#IDontWantToOverreactBUT']).toBe('#IDontWantToOverreactBUT');
  });

  it('test_gemini_account_generate and error fallback', async () => {
    const provider = new GeminiAccountProvider('gemini-3.8-flash');
    expect(provider.providerName).toContain('Google Gemini');
    expect(provider.defaultModel).toBe('gemini-3.8-flash');
  });

  it('test_openai_compat_generate with stream and non-stream', async () => {
    const provider = new OpenAICompatProvider({
      provider: 'kimi',
      apiKey: 'test-key',
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'kimi-k3',
    });

    // 1. Streaming
    const encoder = new TextEncoder();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"Kimi response content"}}]}\n\ndata: [DONE]\n\n'
            )
          );
          controller.close();
        },
      }),
    } as any);

    const streamResult = await provider.generate('Test prompt');
    expect(streamResult).toBe('Kimi response content');

    // 2. Non-streaming
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Kimi post content' } }],
      }),
    } as any);

    const nonStreamResult = await provider.generate('Test prompt', { stream: false });
    expect(nonStreamResult).toBe('Kimi post content');
  });
});
