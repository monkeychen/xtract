import { describe, it, expect } from 'vitest';
import { extractTweetTitleAndSnippet, formatRelativeTime, formatCount } from '../src/renderer/src/views/StudioView.js';

describe('StudioView List Formatter (extractTweetTitleAndSnippet)', () => {
  it('should extract explicit markdown title if first line starts with #', () => {
    const raw = '# Claude 3.7 Sonnet 深度评测\n在多项编码和长思维链基准测试中，Claude 3.7 展现出强大的推理潜力。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('Claude 3.7 Sonnet 深度评测');
    expect(res.snippet).toBe('在多项编码和长思维链基准测试中，Claude 3.7 展现出强大的推理潜力。');
  });

  it('should extract bracketed topic from first line as title', () => {
    const raw = '【重磅发布】Anthropic 推出全新混合推理架构\n今天凌晨正式上线，支持实时调节思考预算。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('【重磅发布】 Anthropic 推出全新混合推理架构');
    expect(res.snippet).toBe('今天凌晨正式上线，支持实时调节思考预算。');
  });

  it('should use first line as title and remaining lines as snippet for multi-line tweet', () => {
    const raw = '深度解析 LLM 的多轮对话上下文管理。\n第一点是滑动窗口；\n第二点是向量检索；\n第三点是思维链压缩。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('深度解析 LLM 的多轮对话上下文管理。');
    expect(res.snippet).toContain('第一点是滑动窗口');
  });

  it('should treat short single-line tweet as pure title without snippet', () => {
    const raw = '只能说MiniMax-3是真的拉...';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('只能说MiniMax-3是真的拉...');
    expect(res.snippet).toBeUndefined();
  });

  it('should treat single-line "收藏" as pure title', () => {
    const raw = '收藏';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('收藏');
    expect(res.snippet).toBeUndefined();
  });

  it('should split long single-line tweet by punctuation into title and snippet', () => {
    const raw = '春节一人独闯老家，去他妈的传统观念，哪那么多执念，如果执念让我们都不舒服，那就不能在思绪里出现，瞬间都不行。';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('春节一人独闯老家');
    expect(res.snippet).toContain('去他妈的传统观念');
  });

  it('should handle pure link tweets gracefully', () => {
    const raw = 'https://t.co/GQWBDf6QnW';
    const res = extractTweetTitleAndSnippet(raw);
    expect(res.title).toBe('🔗 https://t.co/GQWBDf6QnW');
    expect(res.snippet).toBeUndefined();
  });

  it('should handle empty or whitespace text gracefully', () => {
    expect(extractTweetTitleAndSnippet('').title).toBe('（无文本推文）');
    expect(extractTweetTitleAndSnippet('   ').title).toBe('（无文本推文）');
  });
});

describe('StudioView formatRelativeTime & formatCount', () => {
  it('should format relative times correctly', () => {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(formatRelativeTime(tenMinAgo)).toBe('10分钟前');

    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe('2小时前');
  });

  it('should format numbers with K / M suffix', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(450)).toBe('450');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(2500000)).toBe('2.5M');
  });
});
