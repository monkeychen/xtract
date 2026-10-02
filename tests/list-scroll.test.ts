import { describe, it, expect } from 'vitest';
import { shouldScrollListTimeline } from '../src/main/client/index.js';

/**
 * X 列表滚动加载的停止判据（纯函数）
 *
 * 回归背景：旧实现固定滚动 ceil(limit/20) 轮、每轮仅 2500px——列表内容
 * 加载慢时 GraphQL 流只捕获到十几条就停手，limit=50 实得 15 条（真机实测）。
 * 改为按「实际捕获的 GraphQL 响应批次数」驱动滚动，三重停止条件：
 *   1. 捕获批次数 ≥ 目标页数（limit 已吃满）
 *   2. 连续 3 轮无新增批次（列表已到底）
 *   3. 轮数硬上限（防死循环护栏）
 */
describe('shouldScrollListTimeline（X 列表滚动停止判据）', () => {
  const base = { targetBatches: 3, maxRounds: 7 };

  it('捕获批次数已达目标页数时应停止', () => {
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 3, stagnantRounds: 0, round: 2 })).toBe(false);
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 5, stagnantRounds: 0, round: 2 })).toBe(false);
  });

  it('未达目标且仍有新增时应继续滚动', () => {
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 1, stagnantRounds: 0, round: 2 })).toBe(true);
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 2, stagnantRounds: 1, round: 3 })).toBe(true);
  });

  it('连续 3 轮无新增批次应停止（列表到底，不必等满轮数）', () => {
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 1, stagnantRounds: 2, round: 5 })).toBe(true);
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 1, stagnantRounds: 3, round: 5 })).toBe(false);
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 0, stagnantRounds: 5, round: 6 })).toBe(false);
  });

  it('轮数超过硬上限必须停止（护栏）', () => {
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 1, stagnantRounds: 0, round: 7 })).toBe(true);
    expect(shouldScrollListTimeline({ ...base, capturedBatches: 1, stagnantRounds: 0, round: 8 })).toBe(false);
  });
});
