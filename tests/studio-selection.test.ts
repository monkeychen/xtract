import { describe, it, expect } from 'vitest';
import { isAllSelected } from '../src/renderer/src/views/studio/logic.js';

const checked = (...ids: string[]) => new Set(ids);

describe('isAllSelected (全选语义 §缺陷1 回归)', () => {
  it('should be false when nothing is visible', () => {
    expect(isAllSelected([], checked())).toBe(false);
  });

  it('should be true when every visible id is checked', () => {
    expect(isAllSelected(['a', 'b', 'c'], checked('a', 'b', 'c'))).toBe(true);
  });

  it('should be false when at least one visible id is unchecked', () => {
    expect(isAllSelected(['a', 'b', 'c'], checked('a', 'b'))).toBe(false);
  });

  it('should be false when nothing is checked', () => {
    expect(isAllSelected(['a'], checked())).toBe(false);
  });

  it('MUST stay true when the selection also contains filtered-out ids', () => {
    // 关键词过滤后可见项从 5 条缩到 2 条，而勾选集合仍持有 5 个 id。
    // 按集合大小比较会误判为「未全选」，正确语义应仍为「已全选可见项」。
    expect(isAllSelected(['a', 'b'], checked('a', 'b', 'c', 'd', 'e'))).toBe(true);
  });

  it('should ignore checked ids that are no longer in the visible set', () => {
    expect(isAllSelected(['a'], checked('a', 'zzz'))).toBe(true);
    expect(isAllSelected(['a', 'b'], checked('a', 'zzz'))).toBe(false);
  });
});
