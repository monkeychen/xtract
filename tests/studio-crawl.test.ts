import { describe, it, expect } from 'vitest';
import {
  computePages,
  extractTweetIdFromQuery,
  resolveListId,
  validateCrawlTarget,
} from '../src/renderer/src/views/studio/logic.js';

// ============================================================================
// 抓取前置守卫与入参计算
// 抽离自 handleCrawl (885-1053) 的分支树，契约见 design.md §2.7
// ============================================================================

describe('computePages (抓取条数→分页数 §2.7)', () => {
  it('should map 20 items onto a single page', () => {
    expect(computePages(20)).toBe(1);
  });

  it('should round up for non-multiples of the page size', () => {
    expect(computePages(50)).toBe(3);
    expect(computePages(100)).toBe(5);
    expect(computePages(21)).toBe(2);
  });

  it('MUST never return less than one page for degenerate limits', () => {
    expect(computePages(0)).toBe(1);
    expect(computePages(1)).toBe(1);
    expect(computePages(-10)).toBe(1);
  });
});

describe('extractTweetIdFromQuery (精准单推文识别 §2.7)', () => {
  it('should extract the id from a full status URL', () => {
    expect(extractTweetIdFromQuery('https://x.com/karpathy/status/1234567890123456789')).toBe(
      '1234567890123456789'
    );
  });

  it('should accept a bare tweet id', () => {
    expect(extractTweetIdFromQuery('1234567890')).toBe('1234567890');
  });

  it('should not match ids shorter than five digits', () => {
    // 正则要求 \d{5,}，避免把普通数字误判为推文 ID
    expect(extractTweetIdFromQuery('1234')).toBeUndefined();
    expect(extractTweetIdFromQuery('https://x.com/a/status/123')).toBeUndefined();
  });

  it('should return undefined for ordinary search keywords', () => {
    expect(extractTweetIdFromQuery('AI 大模型')).toBeUndefined();
    expect(extractTweetIdFromQuery('')).toBeUndefined();
  });
});

describe('resolveListId (X 列表 ID 解析 §2.7)', () => {
  it('should pass through a bare numeric list id', () => {
    expect(resolveListId('1234567890')).toBe('1234567890');
  });

  it('should extract the id from a list URL', () => {
    expect(resolveListId('https://x.com/i/lists/1234567890')).toBe('1234567890');
  });

  it('should return the input unchanged when no numeric id is present', () => {
    expect(resolveListId('mylist')).toBe('mylist');
    expect(resolveListId('')).toBe('');
  });
});

describe('validateCrawlTarget (抓取目标合法性守卫 §2.7)', () => {
  it('should reject an empty search keyword', () => {
    expect(validateCrawlTarget('search', '')).toEqual({ ok: false, message: '请输入要搜索的关键词' });
  });

  it('should reject a whitespace-only search keyword', () => {
    expect(validateCrawlTarget('search', '   ')).toEqual({ ok: false, message: '请输入要搜索的关键词' });
  });

  it('should accept a non-empty search keyword', () => {
    expect(validateCrawlTarget('search', 'AI')).toEqual({ ok: true });
  });

  it('should reject an empty user handle', () => {
    expect(validateCrawlTarget('user', '')).toEqual({
      ok: false,
      message: '请输入要追踪的博主用户名（如 @username）',
    });
  });

  it('should reject a lone @ as a user handle', () => {
    expect(validateCrawlTarget('user', '@')).toEqual({
      ok: false,
      message: '请输入要追踪的博主用户名（如 @username）',
    });
  });

  it('should accept a user handle with or without the @ prefix', () => {
    expect(validateCrawlTarget('user', 'karpathy')).toEqual({ ok: true });
    expect(validateCrawlTarget('user', '@karpathy')).toEqual({ ok: true });
  });

  it('MUST always accept the following and lists sources', () => {
    // 这两个源的目标校验各自在 handleCrawl 内单独处理，不并入本函数
    expect(validateCrawlTarget('following', '')).toEqual({ ok: true });
    expect(validateCrawlTarget('lists', '')).toEqual({ ok: true });
  });
});
